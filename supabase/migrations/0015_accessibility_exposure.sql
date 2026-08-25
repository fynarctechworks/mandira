-- 0014_accessibility_exposure.sql — traveler access to accessibility and route stops.
--
-- Resolves the blocking half of OPEN-009. Since 0008 the knowledge tables have been
-- deny-by-default to travelers (D-029: the `v_published_*` views are the sole read
-- surface), and `accessibility_records` and `route_places` had no view at all. So
-- PRD-DISC-003 asks for accessibility icons on experience cards that nothing could
-- supply, and the engine's wheelchair check (PRD-HLTH-005) reads a `step_free` value the
-- database could not hand it.
--
-- Two columns on existing views rather than a tenth and eleventh view (D-077). Nothing
-- gains a base-table grant; the views keep running with definer's rights, exactly as
-- before.
--
-- DELIBERATELY STILL CLOSED: `circuits` (M5), `destination_links` and
-- `live_feed_readings` (B-031). No feature needs them yet, and opening a surface before
-- something reads it means nobody notices when it is opened too far.

-- ══════════════════════════════════════════════════════════════════════════════
-- accessibility_for — one entity's accessibility, or NULL when none is recorded.
--
-- NULL, not an empty object. "We have no accessibility information for this place" and
-- "we checked and it has none of these features" are completely different things to a
-- wheelchair user, and a `{}` that renders as a row of grey icons says the second while
-- meaning the first (PRD-KNOW-005, and the same reasoning as `step_free`'s tri-state).
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function accessibility_for(p_place_id uuid, p_route_id uuid)
returns jsonb
language sql
stable
parallel safe
-- SECURITY DEFINER for the reason 0014 sets out: a function called inside a view runs with
-- the INVOKER's rights, and a traveler cannot read accessibility_records directly.
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'step_free', a.step_free,
    'wheelchair_access', a.wheelchair_access,
    'queue_assistance', a.queue_assistance,
    'rest_seating', a.rest_seating,
    'distance_from_dropoff_m', a.distance_from_dropoff_m,
    'notes_i18n', a.notes_i18n
  )
  from accessibility_records a
  where (p_place_id is not null and a.place_id = p_place_id)
     or (p_route_id is not null and a.route_id = p_route_id);
$$;

comment on function accessibility_for(uuid, uuid) is
  'Accessibility for a place or route, or NULL when unrecorded (PRD-DISC-003, PRD-HLTH-005).';

-- ══════════════════════════════════════════════════════════════════════════════
-- route_stops_for — a route''s stops, in order, PUBLISHED ONES ONLY.
--
-- The join to `places` is what keeps the publish gate intact: a route that passes its own
-- gate must not become a way to read an unpublished place through its stop list. The
-- names come from `v_published_places`, so every stop has already cleared its own critical
-- fields.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function route_stops_for(p_route_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'place_id', p.id,
        'name_i18n', p.name_i18n,
        'sort_order', rp.sort_order,
        'is_rest_point', rp.is_rest_point
      )
      order by rp.sort_order
    ),
    '[]'::jsonb
  )
  from route_places rp
  join v_published_places p on p.id = rp.place_id
  where rp.route_id = p_route_id;
$$;

comment on function route_stops_for(uuid) is
  'Published stops of a route, in order. Unpublished places are absent, not hidden-but-counted.';

-- ══════════════════════════════════════════════════════════════════════════════
-- The views, with the new columns APPENDED.
--
-- Appended, never inserted: a client selecting columns positionally would silently read
-- the wrong field, and `create or replace view` refuses anything else anyway. This is a
-- view shape change, so it needs a Dexie version bump when the snapshot lands in B-023
-- (CLAUDE.md §4) — noted in the plan rather than left to be discovered.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace view v_published_places as
select
  p.id, p.destination_id, p.slug, p.name_i18n, p.place_type, p.facility_subtype,
  p.location, p.address, p.summary_i18n,
  p.opening_schedule, p.closure_rules_i18n, p.entry_requirements_i18n, p.dress_code_i18n,
  p.visit_duration_min_minutes, p.visit_duration_likely_minutes, p.visit_duration_max_minutes,
  p.crowd_pattern, p.hours_note_i18n, p.editorial_weight, p.published_at,
  entity_trust('places', p.id) as trust,
  accessibility_for(p.id, null) as accessibility
from places p
where p.status = 'published'
  and p.deleted_at is null
  and critical_fields_gated(
        'places', p.id,
        array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
      );

/*
 * An experience shows the accessibility of the place it happens at.
 *
 * PRD-DISC-003 puts the icons on the EXPERIENCE card, and a traveler choosing between two
 * darshans is not going to open two place pages to find out which one they can get into.
 * Resolved through the place's own published view, so an experience can never expose the
 * accessibility of a place that has not itself cleared the gate.
 */
create or replace view v_published_experiences as
select
  e.id, e.destination_id, e.place_id, e.route_id, e.slug, e.name_i18n, e.experience_type,
  e.significance_i18n, e.description_i18n,
  e.duration_min_minutes, e.duration_likely_minutes, e.duration_max_minutes,
  e.advance_booking_required, e.advance_booking_how_i18n, e.advance_booking_opens_days_before,
  e.eligibility_i18n, e.cost_note_i18n, e.queue_expectation_i18n, e.preparation_i18n,
  e.is_outdoor, e.editorial_weight, e.published_at,
  entity_trust('experiences', e.id) as trust,
  (select p.accessibility from v_published_places p where p.id = e.place_id) as accessibility
from experiences e
where e.status = 'published'
  and e.deleted_at is null
  and critical_fields_gated(
        'experiences', e.id,
        array['advance_booking_required', 'advance_booking_how_i18n']
      );

create or replace view v_published_routes as
select
  r.id, r.destination_id, r.slug, r.name_i18n, r.mode, r.distance_m,
  r.duration_min_minutes, r.duration_likely_minutes, r.duration_max_minutes,
  r.difficulty, r.elevation_note_i18n, r.geometry, r.published_at,
  entity_trust('routes', r.id) as trust,
  accessibility_for(null, r.id) as accessibility,
  route_stops_for(r.id) as stops
from routes r
where r.status = 'published'
  and r.deleted_at is null;

-- Granted explicitly rather than inherited from PUBLIC, as in 0014. EXECUTE cannot be
-- withheld from the client roles: a function called inside a view is checked against the
-- invoker, so revoking it would break the view for the travelers it exists to serve.
revoke all on function accessibility_for(uuid, uuid) from public;
revoke all on function route_stops_for(uuid) from public;

grant execute on function accessibility_for(uuid, uuid) to anon, authenticated;
grant execute on function route_stops_for(uuid) to anon, authenticated;

-- The grants from 0007 follow the views, so nothing new is granted here. Stated rather
-- than assumed, because "the view changed but the grant did not" is the kind of thing
-- that is only obvious until it is not.
