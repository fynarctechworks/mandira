-- pgTAP: 0043 — a journey reuses the traveler's saved profile of the same person, and
-- duplicates already stored fold into one.

begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4300000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'planner@0043.test'),
  ('f4300000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'duplicates@0043.test');

create or replace function t43_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- ── Planning the same people again ──────────────────────────────────────────────────────

select t43_as('f4300000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select create_journey($j${"start_date": "2026-11-01", "travelers": [
       {"label": null, "mobility": "full", "age_band": "adult", "is_self": true},
       {"label": "Amma", "mobility": "limited_walking", "age_band": "senior", "is_self": false}
     ]}$j$::jsonb) $$,
  'a first journey with two travelers saves');
select lives_ok(
  $$ select create_journey($j${"start_date": "2026-12-01", "travelers": [
       {"label": null, "mobility": "full", "age_band": "adult", "is_self": true},
       {"label": " AMMA ", "mobility": "limited_walking", "age_band": "senior", "is_self": false}
     ]}$j$::jsonb) $$,
  'and a second with the same two');

reset role;
select is(
  (select count(*)::int from traveler_profiles where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1'),
  2, 'the same people planned twice are two profiles, not four');
select is(
  (select count(*)::int from journey_travelers jt join journeys j on j.id = jt.journey_id
    where j.owner_user_id = 'f4300000-0000-4000-8000-0000000000a1'),
  4, 'and both journeys still travel with both of them');

select t43_as('f4300000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select create_journey($j${"start_date": "2027-01-01", "travelers": [
       {"label": "Amma", "mobility": "wheelchair", "age_band": "senior", "is_self": false}
     ]}$j$::jsonb) $$,
  'a journey where Amma uses a wheelchair saves');

reset role;
select is(
  (select count(*)::int from traveler_profiles where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1'),
  3, 'a different need is a different profile, so earlier plans keep the one they used');

select t43_as('f4300000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select create_journey($j${"start_date": "2027-02-01", "travelers": [
       {"label": null, "mobility": "full", "age_band": "child", "is_self": false},
       {"label": null, "mobility": "full", "age_band": "child", "is_self": false}
     ]}$j$::jsonb) $$,
  'a journey with twins saves');

reset role;
select is(
  (select count(*)::int from traveler_profiles
    where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1' and age_band = 'child'),
  2, 'two identical travelers in one journey are two people');

update traveler_profiles set deleted_at = now()
 where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1'
   and lower(label) = 'amma' and mobility = 'limited_walking';

select t43_as('f4300000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select create_journey($j${"start_date": "2027-03-01", "travelers": [
       {"label": "Amma", "mobility": "limited_walking", "age_band": "senior", "is_self": false}
     ]}$j$::jsonb) $$,
  'a journey after removing a traveler saves');

reset role;
select is(
  (select count(*)::int from traveler_profiles
    where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1'
      and lower(label) = 'amma' and mobility = 'limited_walking'),
  2, 'a removed traveler is not quietly brought back');

-- ── Folding the duplicates already stored ───────────────────────────────────────────────

insert into traveler_profiles (id, owner_user_id, label, mobility, age_band, is_self, created_at) values
  ('f4310000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-0000000000a2', 'Appa', 'full', 'senior', false, now() - interval '3 days'),
  ('f4310000-0000-4000-8000-000000000002', 'f4300000-0000-4000-8000-0000000000a2', 'appa', 'full', 'senior', false, now() - interval '2 days'),
  ('f4310000-0000-4000-8000-000000000003', 'f4300000-0000-4000-8000-0000000000a2', 'Appa', 'full', 'senior', false, now() - interval '1 day'),
  ('f4310000-0000-4000-8000-000000000004', 'f4300000-0000-4000-8000-0000000000a2', 'Appa', 'wheelchair', 'senior', false, now());

insert into journeys (id, owner_user_id, title, start_date) values
  ('f4320000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-0000000000a2', 'First', '2026-11-01'),
  ('f4320000-0000-4000-8000-000000000002', 'f4300000-0000-4000-8000-0000000000a2', 'Second', '2026-12-01');

-- One copy per journey, as 0031 made them.
insert into journey_travelers (journey_id, traveler_profile_id) values
  ('f4320000-0000-4000-8000-000000000001', 'f4310000-0000-4000-8000-000000000002'),
  ('f4320000-0000-4000-8000-000000000002', 'f4310000-0000-4000-8000-000000000003');

-- u1's twins are identical too, but they share a journey, so they are two people.
-- The merge runs over every owner, so its total depends on whatever else the database holds;
-- what this test owns is its own users' profiles.
select cmp_ok(merge_duplicate_traveler_profiles(), '>=', 2, 'the copies are folded away');
select is(
  (select count(*)::int from traveler_profiles where owner_user_id = 'f4300000-0000-4000-8000-0000000000a2'),
  2, 'leaving the person once, and the different profile untouched');
select is(
  (select traveler_profile_id from journey_travelers
    where journey_id = 'f4320000-0000-4000-8000-000000000001'),
  'f4310000-0000-4000-8000-000000000001'::uuid,
  'a journey now travels with the oldest profile');
select is(
  (select traveler_profile_id from journey_travelers
    where journey_id = 'f4320000-0000-4000-8000-000000000002'),
  'f4310000-0000-4000-8000-000000000001'::uuid,
  'and so does every other journey the copies were on');
select is(
  (select count(*)::int from traveler_profiles
    where owner_user_id = 'f4300000-0000-4000-8000-0000000000a1' and age_band = 'child'),
  2, 'twins who travel together are never folded into one');

select t43_as('f4300000-0000-4000-8000-0000000000a2');
select throws_ok(
  $$ select merge_duplicate_traveler_profiles() $$,
  '42501', null, 'no signed-in user can run the merge');

reset role;
select * from finish();
rollback;
