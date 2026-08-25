-- 0007_published_views.sql — TRD §4.4 published views (TRD-ARCH-004, D-010, PRD-KNOW-003).
--
-- These views are the ONLY knowledge surface the traveler app reads. That is a structural
-- guarantee, not a convention: base tables have RLS with no traveler policy, so the publish
-- gate cannot be bypassed by querying a table directly or by forgetting a `where` clause in
-- application code.
--
-- Each view:
--   * filters status = 'published' and deleted_at is null
--   * requires every CRITICAL field to carry trust >= human_reviewed (PRD-KNOW-003)
--   * exposes an aggregated `trust jsonb` column so a TrustBadge can render without a
--     second query (PRD F9 acceptance: 100% of published critical fields render a badge)
--
-- SECURITY MODEL: these views run with the definer's rights (security_invoker is left
-- off deliberately) so they can read past the base tables' RLS and return exactly the
-- published subset. Grants below are the access control. Do NOT add security_invoker
-- without also adding traveler SELECT policies to every base table (B-006).

-- ══════════════════════════════════════════════════════════════════════════════
-- Trust aggregation
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Source tier in words (PRD F9: "Source: [source name, tier in words]").
 * Wording is from PRD §F1 source_tier: T1 official authority / T2 official destination
 * org or licensed provider / T3 approved partner or structured service / T4 curated
 * research / T5 user report.
 */
create or replace function source_tier_label(p_tier source_tier_enum)
returns text
language sql
immutable
parallel safe
as $$
  select case p_tier
    when 'T1' then 'Official authority'
    when 'T2' then 'Official destination organisation or licensed provider'
    when 'T3' then 'Approved partner or structured service'
    when 'T4' then 'Curated research'
    when 'T5' then 'Traveler report'
  end;
$$;

/*
 * Collapses every trust record for one entity into the `trust jsonb` shape the client
 * renders from. Keys are field names; whole-entity trust (field_name IS NULL) is keyed
 * as "entity", matching the TRD's "<field_name|entity>".
 *
 * Confidence is NOT recomputed here — it is read from the stored column, which 0002's
 * trigger derives. One definition, one place.
 */
create or replace function entity_trust(p_entity_table text, p_entity_id uuid)
returns jsonb
language sql
stable
parallel safe
as $$
  select coalesce(
    jsonb_object_agg(
      coalesce(t.field_name, 'entity'),
      jsonb_build_object(
        'confidence', t.confidence,
        'freshness', t.freshness,
        'verified_at', t.verified_at,
        'valid_until', t.valid_until,
        'source_name', s.name,
        'source_tier_label', source_tier_label(t.source_tier),
        'conflict_flag', t.conflict_flag
      )
    ),
    '{}'::jsonb
  )
  from trust_records t
  left join sources s on s.id = t.source_id
  where t.entity_table = p_entity_table
    and t.entity_id = p_entity_id;
$$;

/*
 * The publish gate for critical fields (PRD-KNOW-003, PRD-KNOW-002).
 *
 * Returns true only when EVERY named critical field has a trust record at
 * verification_status >= human_reviewed. A missing trust record fails the gate: PRD F9
 * requires 100% of published critical fields to render a badge, and a field with no
 * record has no badge to render.
 *
 * NOTE on enum ordering: verification_status_enum is
 *   unverified < ai_extracted < human_reviewed < verified < disputed
 * so ">= human_reviewed" admits `disputed` as well. That is the literal TRD §4.4 rule and
 * it is consistent with PRD F9, which says low-confidence and conflicted facts must be
 * SHOWN with a "Check locally" badge rather than hidden — a disputed field carries
 * conflict_flag, so it surfaces as low confidence rather than disappearing.
 */
create or replace function critical_fields_gated(
  p_entity_table text,
  p_entity_id uuid,
  p_fields text[]
)
returns boolean
language sql
stable
parallel safe
as $$
  select not exists (
    select 1
    from unnest(p_fields) as required(field_name)
    where not exists (
      select 1
      from trust_records t
      where t.entity_table = p_entity_table
        and t.entity_id = p_entity_id
        and t.field_name = required.field_name
        and t.verification_status >= 'human_reviewed'
    )
  );
$$;

comment on function critical_fields_gated(text, uuid, text[]) is
  'True when every listed critical field has trust >= human_reviewed. Missing record = not gated.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Published views
-- ══════════════════════════════════════════════════════════════════════════════

-- Destinations carry no critical fields of their own (§4.4 marks none), so the gate is
-- publication status alone.
create view v_published_destinations as
select
  d.id, d.slug, d.name_i18n, d.region, d.state, d.country,
  d.centre, d.radius_km, d.overview_i18n, d.best_seasons_i18n, d.seasonal_notes_i18n,
  d.hero_media_id, d.editorial_weight, d.published_at,
  entity_trust('destinations', d.id) as trust
from destinations d
where d.status = 'published'
  and d.deleted_at is null;

-- CRITICAL: opening_schedule, closure_rules_i18n, entry_requirements_i18n (§4.4).
create view v_published_places as
select
  p.id, p.destination_id, p.slug, p.name_i18n, p.place_type, p.facility_subtype,
  p.location, p.address, p.summary_i18n,
  p.opening_schedule, p.closure_rules_i18n, p.entry_requirements_i18n, p.dress_code_i18n,
  p.visit_duration_min_minutes, p.visit_duration_likely_minutes, p.visit_duration_max_minutes,
  p.crowd_pattern, p.hours_note_i18n, p.editorial_weight, p.published_at,
  entity_trust('places', p.id) as trust
from places p
where p.status = 'published'
  and p.deleted_at is null
  and critical_fields_gated(
        'places', p.id,
        array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
      );

-- CRITICAL: advance_booking_required, advance_booking_how_i18n (§4.4).
create view v_published_experiences as
select
  e.id, e.destination_id, e.place_id, e.route_id, e.slug, e.name_i18n, e.experience_type,
  e.significance_i18n, e.description_i18n,
  e.duration_min_minutes, e.duration_likely_minutes, e.duration_max_minutes,
  e.advance_booking_required, e.advance_booking_how_i18n, e.advance_booking_opens_days_before,
  e.eligibility_i18n, e.cost_note_i18n, e.queue_expectation_i18n, e.preparation_i18n,
  e.is_outdoor, e.editorial_weight, e.published_at,
  entity_trust('experiences', e.id) as trust
from experiences e
where e.status = 'published'
  and e.deleted_at is null
  and critical_fields_gated(
        'experiences', e.id,
        array['advance_booking_required', 'advance_booking_how_i18n']
      );

/*
 * Availability rules are critical in their entirety (§4.4), so the gate is whole-entity
 * trust rather than a field list. They have no status column of their own — they inherit
 * publication from their experience, which must itself pass its gate.
 */
create view v_published_availability_rules as
select
  a.id, a.experience_id, a.kind, a.daily_times, a.weekly_pattern,
  a.date_start, a.date_end, a.calendar_dates,
  a.season_label_i18n, a.capacity_note_i18n, a.priority, a.valid_from, a.valid_to,
  entity_trust('availability_rules', a.id) as trust
from availability_rules a
join v_published_experiences e on e.id = a.experience_id
where exists (
  select 1
  from trust_records t
  where t.entity_table = 'availability_rules'
    and t.entity_id = a.id
    and t.field_name is null
    and t.verification_status >= 'human_reviewed'
);

create view v_published_routes as
select
  r.id, r.destination_id, r.slug, r.name_i18n, r.mode, r.distance_m,
  r.duration_min_minutes, r.duration_likely_minutes, r.duration_max_minutes,
  r.difficulty, r.elevation_note_i18n, r.geometry, r.published_at,
  entity_trust('routes', r.id) as trust
from routes r
where r.status = 'published'
  and r.deleted_at is null;

-- CRITICAL: duration_likely_minutes (§4.4).
create view v_published_transport_connections as
select
  tc.id, tc.destination_id,
  tc.from_place_id, tc.from_destination_id, tc.to_place_id, tc.to_destination_id,
  tc.mode, tc.duration_likely_minutes, tc.duration_max_minutes,
  tc.frequency_note_i18n, tc.operator, tc.booking_note_i18n, tc.seasonal_note_i18n,
  tc.published_at,
  entity_trust('transport_connections', tc.id) as trust
from transport_connections tc
where tc.status = 'published'
  and critical_fields_gated('transport_connections', tc.id, array['duration_likely_minutes']);

create view v_published_guidance_blocks as
select
  g.id, g.guidance_type, g.body_i18n, g.applies_to_table, g.applies_to_id,
  g.sort_order, g.published_at,
  entity_trust('guidance_blocks', g.id) as trust
from guidance_blocks g
where g.status = 'published'
  and g.deleted_at is null;

create view v_published_phrases as
select
  ph.id, ph.destination_id, ph.context_tag, ph.source_locale, ph.source_text,
  ph.translations, ph.audio_media_id, ph.sort_order, ph.published_at,
  entity_trust('phrases', ph.id) as trust
from phrases ph
where ph.status = 'published';

create view v_published_advisories as
select
  ad.id, ad.destination_id, ad.title_i18n, ad.body_i18n, ad.severity,
  ad.starts_at, ad.ends_at, ad.published_at,
  entity_trust('advisories', ad.id) as trust
from advisories ad
where ad.status = 'published';

-- ══════════════════════════════════════════════════════════════════════════════
-- Grants — the views are the traveler's entire read surface
-- ══════════════════════════════════════════════════════════════════════════════

grant select on
  v_published_destinations,
  v_published_places,
  v_published_experiences,
  v_published_availability_rules,
  v_published_routes,
  v_published_transport_connections,
  v_published_guidance_blocks,
  v_published_phrases,
  v_published_advisories
to anon, authenticated;
