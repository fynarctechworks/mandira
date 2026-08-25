-- pgTAP: traveler access to accessibility and route stops (OPEN-009, PRD-DISC-003).
--
-- Opening a read surface is the easiest change in the system to get subtly wrong, so most
-- of this file is about what did NOT become visible: an unpublished place must not leak
-- through a route's stop list, an ungated place must not leak through an experience card,
-- and no base table may have gained a grant.

begin;
select plan(28);

select has_function('public', 'accessibility_for', 'accessibility_for() exists');
select has_function('public', 'route_stops_for', 'route_stops_for() exists');

select has_column('public', 'v_published_places', 'accessibility',
  'places expose accessibility');
select has_column('public', 'v_published_experiences', 'accessibility',
  'experiences expose accessibility, because PRD-DISC-003 puts the icons on that card');
select has_column('public', 'v_published_routes', 'accessibility', 'routes expose accessibility');
select has_column('public', 'v_published_routes', 'stops', 'routes expose their stops');

-- ══════════════════════════════════════════════════════════════════════════════
-- Fixtures: one published place that clears its gate, one published place that does
-- not, and one still in draft.
-- ══════════════════════════════════════════════════════════════════════════════

insert into sources (id, name, source_type, tier)
values ('e2000000-0000-4000-8000-000000000001', 'Temple authority', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('e3000000-0000-4000-8000-000000000001', 'access-test', '{"en":"Access Test"}'::jsonb,
        'SRID=4326;POINT(83.0107 25.3109)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location, status)
values
  ('e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
   'gated-open', '{"en":"Cleared Temple"}'::jsonb, 'temple',
   'SRID=4326;POINT(83.0110 25.3112)', 'published'),
  ('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001',
   'ungated', '{"en":"Ungated Temple"}'::jsonb, 'temple',
   'SRID=4326;POINT(83.0111 25.3113)', 'published'),
  ('e4000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000001',
   'still-draft', '{"en":"Draft Temple"}'::jsonb, 'temple',
   'SRID=4326;POINT(83.0112 25.3114)', 'draft');

-- Only the first place clears its three critical fields.
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'e4000000-0000-4000-8000-000000000001', f,
       'e2000000-0000-4000-8000-000000000001', 'T1', 'verified'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

insert into accessibility_records (place_id, step_free, wheelchair_access, rest_seating, distance_from_dropoff_m)
values ('e4000000-0000-4000-8000-000000000001', 'partial', 'no', true, 400);

-- ══════════════════════════════════════════════════════════════════════════════
-- What a traveler sees
-- ══════════════════════════════════════════════════════════════════════════════

select is(
  (select accessibility ->> 'step_free' from v_published_places
   where id = 'e4000000-0000-4000-8000-000000000001'),
  'partial',
  'the recorded value comes through with its own vocabulary intact'
);

select is(
  (select accessibility ->> 'distance_from_dropoff_m' from v_published_places
   where id = 'e4000000-0000-4000-8000-000000000001'),
  '400',
  'and so do the numbers a traveler plans around'
);

-- "We have no information" and "we checked and it has none of these" are different
-- things, and a `{}` rendering as grey icons says the second while meaning the first.
insert into places (id, destination_id, slug, name_i18n, place_type, location, status)
values ('e4000000-0000-4000-8000-000000000004', 'e3000000-0000-4000-8000-000000000001',
        'no-record', '{"en":"Unrecorded Temple"}'::jsonb, 'temple',
        'SRID=4326;POINT(83.0113 25.3115)', 'published');
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'e4000000-0000-4000-8000-000000000004', f,
       'e2000000-0000-4000-8000-000000000001', 'T1', 'verified'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

select is(
  (select accessibility from v_published_places
   where id = 'e4000000-0000-4000-8000-000000000004'),
  null,
  'a place with no accessibility record reads as NULL, never as an empty object'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- The gate still holds
-- ══════════════════════════════════════════════════════════════════════════════

select is_empty(
  $$ select 1 from v_published_places where id = 'e4000000-0000-4000-8000-000000000002' $$,
  'a published place that has not cleared its critical fields is still invisible'
);

select is_empty(
  $$ select 1 from v_published_places where id = 'e4000000-0000-4000-8000-000000000003' $$,
  'a draft place is still invisible'
);

-- Accessibility on an ungated place must not become a way to learn it exists.
insert into accessibility_records (place_id, step_free)
values ('e4000000-0000-4000-8000-000000000002', 'yes');

select is(
  (select count(*)::int from v_published_places
   where accessibility ->> 'step_free' = 'yes'),
  0,
  'recording accessibility does not publish a place that has not cleared its gate'
);

-- ── Experiences inherit from their place, through the gated view ─────────────
insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type, status)
values
  ('e5000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000001', 'cleared-darshan', '{"en":"Cleared Darshan"}'::jsonb,
   'darshan', 'published'),
  ('e5000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000002', 'ungated-darshan', '{"en":"Ungated Darshan"}'::jsonb,
   'darshan', 'published');

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'experiences', e, f, 'e2000000-0000-4000-8000-000000000001', 'T1', 'verified'
from unnest(array['e5000000-0000-4000-8000-000000000001'::uuid,
                  'e5000000-0000-4000-8000-000000000002'::uuid]) e,
     unnest(array['advance_booking_required', 'advance_booking_how_i18n']) f;

select is(
  (select accessibility ->> 'step_free' from v_published_experiences
   where id = 'e5000000-0000-4000-8000-000000000001'),
  'partial',
  'an experience shows the accessibility of the place it happens at'
);

select is(
  (select accessibility from v_published_experiences
   where id = 'e5000000-0000-4000-8000-000000000002'),
  null,
  'an experience whose PLACE has not cleared its gate shows nothing, not the place''s data'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Route stops
-- ══════════════════════════════════════════════════════════════════════════════

insert into routes (id, destination_id, slug, name_i18n, mode, status)
values ('e6000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001',
        'hill-path', '{"en":"Hill Path"}'::jsonb, 'walk', 'published');

insert into route_places (route_id, place_id, sort_order, is_rest_point)
values
  ('e6000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000004', 1, true),
  ('e6000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 0, false),
  -- A stop that has not cleared its own gate, and one still in draft.
  ('e6000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 2, false),
  ('e6000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000003', 3, false);

select is(
  (select jsonb_array_length(stops) from v_published_routes
   where id = 'e6000000-0000-4000-8000-000000000001'),
  2,
  'only stops that have cleared their own gate appear'
);

select is(
  (select stops -> 0 ->> 'place_id' from v_published_routes
   where id = 'e6000000-0000-4000-8000-000000000001'),
  'e4000000-0000-4000-8000-000000000001',
  'and they come back in sort order, not insertion order'
);

select is(
  (select stops -> 1 ->> 'is_rest_point' from v_published_routes
   where id = 'e6000000-0000-4000-8000-000000000001'),
  'true',
  'a rest point is marked, because that is what a traveler who tires is looking for'
);

select is(
  (select stops::text from v_published_routes where id = 'e6000000-0000-4000-8000-000000000001')
    like '%Ungated Temple%',
  false,
  'an unpublished stop does not leak its name through the route it belongs to'
);

insert into routes (id, destination_id, slug, name_i18n, mode, status)
values ('e6000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001',
        'no-stops', '{"en":"No Stops"}'::jsonb, 'walk', 'published');

select is(
  (select stops from v_published_routes where id = 'e6000000-0000-4000-8000-000000000002'),
  '[]'::jsonb,
  'a route with no stops is an empty list, which a client can render without a null check'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Nothing else opened
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Tested AS THE ROLES THEMSELVES, not by counting grants.
 *
 * Counting grants here would prove nothing: Supabase's default privileges hand every table
 * DML grants to `authenticated`, and 0008 gates the knowledge tables with an `is_ops()`
 * policy rather than by withholding the grant. A grant with no satisfiable policy returns
 * nothing — that is the actual control, so that is what these exercise.
 */
insert into auth.users (id, instance_id, aud, role, email)
values ('e1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'traveler@access.test');

-- Identity helpers. 0007 defines its own inside a transaction that is rolled back, so they
-- do not reach here. `set local role` plus the jwt claim is how PostgREST does it.
create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_become_anon() returns void
language plpgsql as $fn$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$fn$;

create function test_become_postgres() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$fn$;

-- A signed-in traveler, holding no Ops role.
select test_become('e1000000-0000-4000-8000-000000000001');

select is_empty(
  $$ select 1 from accessibility_records $$,
  'a signed-in traveler reads nothing from accessibility_records directly'
);
select is_empty(
  $$ select 1 from route_places $$,
  'nor from route_places — the view is still the only way in (D-029)'
);
select isnt_empty(
  $$ select 1 from v_published_places where accessibility is not null $$,
  'but the same traveler does see accessibility through the published view'
);

select test_become_anon();

-- A guest is refused outright rather than shown nothing: `anon` holds no SELECT grant at
-- all on these, where a signed-in traveler holds the grant and is stopped by the policy.
-- Two different mechanisms, both closed, and worth asserting separately.
select throws_ok(
  $$ select 1 from accessibility_records $$,
  '42501',
  null,
  'a guest is refused accessibility_records outright — no grant, not merely no rows'
);
select throws_ok(
  $$ select 1 from route_places $$,
  '42501',
  null,
  'and refused route_places the same way'
);
select isnt_empty(
  $$ select 1 from v_published_routes where stops <> '[]'::jsonb $$,
  'and does see route stops through the published view'
);

select test_become_postgres();

-- The tables OPEN-009 also named, deliberately left closed until something reads them.
select is_empty(
  $$ select tablename from pg_policies
      where schemaname = 'public'
        and tablename in ('circuits', 'destination_links', 'live_feed_readings')
        and 'anon' = any (roles) $$,
  'circuits, destination links and live feeds stay closed to guests until a feature needs them'
);

-- The rule this whole model exists to protect: no Ops role can reach traveler attributes.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'traveler_profiles'
     and qual not like '%owner_user_id%'),
  0,
  'every traveler_profiles policy is owner-scoped; none admits an Ops role (PRD-PRIV-002)'
);

select is_empty(
  $$ select column_name from information_schema.columns
      where table_schema = 'public'
        and table_name like 'v_published_%'
        and column_name in ('mobility', 'age_band', 'dietary') $$,
  'and no published view has grown a column that could carry a traveler attribute'
);

select * from finish();
rollback;
