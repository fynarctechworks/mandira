-- pgTAP: every published view is readable BY A TRAVELER, with content in it.
--
-- This file exists because of a bug it would have caught. Between 0007 and 0014 every
-- published view raised `permission denied for table trust_records` for anon and for any
-- signed-in traveler — the entire read surface was unusable — and nothing noticed, because
-- per-row functions are only evaluated when there are rows and every other pgTAP file runs
-- as `postgres`.
--
-- So: rows first, then read as the roles that will actually read. The point is not what the
-- views contain; 0006 covers that. The point is that a traveler can read them at all.

begin;
select plan(23);

-- ── Identity helpers ────────────────────────────────────────────────────────
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

-- ── Content in every view ───────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
values ('f1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'traveler@surface.test');

insert into sources (id, name, source_type, tier)
values ('f2000000-0000-4000-8000-000000000001', 'Temple authority', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('f3000000-0000-4000-8000-000000000001', 'surface', '{"en":"Surface"}'::jsonb,
        'SRID=4326;POINT(83.0107 25.3109)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location, status)
values ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
        'temple', '{"en":"Temple"}'::jsonb, 'temple',
        'SRID=4326;POINT(83.0110 25.3112)', 'published');

insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type, status)
values ('f5000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
        'f4000000-0000-4000-8000-000000000001', 'darshan', '{"en":"Darshan"}'::jsonb,
        'darshan', 'published');

insert into routes (id, destination_id, slug, name_i18n, mode, status)
values ('f6000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
        'path', '{"en":"Path"}'::jsonb, 'walk', 'published');

insert into route_places (route_id, place_id, sort_order)
values ('f6000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 0);

insert into transport_connections
  (id, destination_id, from_place_id, to_destination_id, mode, duration_likely_minutes, status)
values ('f7000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
        'f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
        'walk', 20, 'published');

insert into availability_rules (id, experience_id, kind, daily_times, priority)
values ('f8000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001',
        'daily_fixed_times', '[{"start":"06:00","end":"07:00"}]'::jsonb, 1);

insert into accessibility_records (place_id, step_free)
values ('f4000000-0000-4000-8000-000000000001', 'yes');

-- Everything critical is reviewed, so all of it clears the gate.
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'f4000000-0000-4000-8000-000000000001', f,
       'f2000000-0000-4000-8000-000000000001', 'T1', 'verified'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'experiences', 'f5000000-0000-4000-8000-000000000001', f,
       'f2000000-0000-4000-8000-000000000001', 'T1', 'verified'
from unnest(array['advance_booking_required', 'advance_booking_how_i18n']) f;

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
values
  ('transport_connections', 'f7000000-0000-4000-8000-000000000001', 'duration_likely_minutes',
   'f2000000-0000-4000-8000-000000000001', 'T1', 'verified'),
  ('availability_rules', 'f8000000-0000-4000-8000-000000000001', null,
   'f2000000-0000-4000-8000-000000000001', 'T1', 'verified');

-- Sanity: as the owner, the content is there to be read.
select isnt_empty(
  $$ select 1 from v_published_places $$,
  'there is content in the views before anyone tries to read them as a traveler'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- As a guest
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_anon();

select lives_ok($$ select * from v_published_destinations $$, 'a guest can read destinations');
select lives_ok($$ select * from v_published_places $$, 'a guest can read places');
select lives_ok($$ select * from v_published_experiences $$, 'a guest can read experiences');
select lives_ok($$ select * from v_published_availability_rules $$,
  'a guest can read availability rules');
select lives_ok($$ select * from v_published_routes $$, 'a guest can read routes');
select lives_ok($$ select * from v_published_transport_connections $$,
  'a guest can read transport connections');
select lives_ok($$ select * from v_published_guidance_blocks $$, 'a guest can read guidance');
select lives_ok($$ select * from v_published_phrases $$, 'a guest can read phrases');
select lives_ok($$ select * from v_published_advisories $$, 'a guest can read advisories');

-- PRD F9: 100% of published critical fields render a badge. A badge cannot render from a
-- permission error, and it cannot render from an empty object either.
select isnt_empty(
  $$ select 1 from v_published_places where trust <> '{}'::jsonb $$,
  'a guest sees the trust badge payload, not an empty object'
);
select is(
  (select trust -> 'opening_schedule' ->> 'source_tier_label' from v_published_places
   where id = 'f4000000-0000-4000-8000-000000000001'),
  'Official authority',
  'including the source tier in words, which is what the trust sheet shows'
);
select isnt_empty(
  $$ select 1 from v_published_experiences where trust <> '{}'::jsonb $$,
  'and on experiences too'
);
select is(
  (select accessibility ->> 'step_free' from v_published_places
   where id = 'f4000000-0000-4000-8000-000000000001'),
  'yes',
  'and the accessibility a wheelchair user is looking for'
);
select is(
  (select jsonb_array_length(stops) from v_published_routes
   where id = 'f6000000-0000-4000-8000-000000000001'),
  1,
  'and a route''s stops'
);

-- The gate is still a gate. A guest is refused outright — `anon` holds no SELECT grant on
-- the base tables at all, where a signed-in traveler holds the grant and is stopped by the
-- policy. Both closed, by different mechanisms.
select throws_ok(
  $$ select 1 from places $$, '42501', null,
  'a guest is still refused the base tables outright (D-029)'
);
select throws_ok(
  $$ select 1 from trust_records $$, '42501', null,
  'and trust_records, which the helpers read on their behalf instead'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- As a signed-in traveler holding no Ops role — the other half of "every traveler"
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('f1000000-0000-4000-8000-000000000001');

select lives_ok($$ select * from v_published_places $$, 'a signed-in traveler can read places');
select lives_ok($$ select * from v_published_experiences $$,
  'a signed-in traveler can read experiences');
select lives_ok($$ select * from v_published_routes $$, 'a signed-in traveler can read routes');
select isnt_empty(
  $$ select 1 from v_published_places where trust <> '{}'::jsonb $$,
  'and sees trust badges, not an empty object'
);
select is_empty(
  $$ select 1 from trust_records $$,
  'while still reading nothing from trust_records directly'
);
select is_empty(
  $$ select 1 from traveler_profiles $$,
  'and nothing from another traveler''s profile (PRD-PRIV-002)'
);

select test_become_postgres();

select * from finish();
rollback;
