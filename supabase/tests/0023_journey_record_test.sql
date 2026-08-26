-- pgTAP: the Journey Record is the traveler's alone (B-036, PRD F16, PRD-CMPL-002).
--
-- `journey_records.reflection_answers` holds three open answers somebody wrote about their
-- own pilgrimage — including "anything we got wrong?". That last one is exactly the field
-- an Ops surface would most like to read, and exactly the one it must not. The privacy
-- promise on the screen ("only you can see these") is either enforced here or it is a lie.
--
-- Every assertion below is a DENIAL except the four that establish the owner can work at
-- all. A failing allow-test is an inconvenience; a failing deny-test is an operator reading
-- a stranger's reflection.

begin;
select plan(16);

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

-- ── A traveler, a stranger, and an admin who is neither ─────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'record-owner@journeys.test'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'record-stranger@journeys.test'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'record-admin@journeys.test');

-- The most privileged Ops role there is. If `admin` cannot reach a reflection, nobody in
-- Ops can, which is the whole claim this file exists to make.
insert into user_roles (user_id, role)
values ('c1000000-0000-4000-8000-000000000003', 'admin');

insert into journeys (id, owner_user_id, title, start_date, end_date, timezone, status)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
        'A record of it', '2026-03-01', '2026-03-03', 'Asia/Kolkata', 'active');

insert into journey_items (id, journey_id, day_index, sort_order, item_type, tier, status)
values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
   0, 0, 'experience', 'protected', 'done'),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001',
   0, 1, 'experience', 'protected', 'planned');

insert into journey_records (journey_id, reflection_answers)
values ('c2000000-0000-4000-8000-000000000001',
        '{"most_meaningful":"the walk up at dawn",
          "do_differently":"fewer stops",
          "got_wrong":"the closing time was wrong"}'::jsonb);

insert into journey_item_notes (item_id, user_id, body)
values ('c3000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001', 'Amma sat for a while.');

-- ── The traveler ────────────────────────────────────────────────────────────
select test_become('c1000000-0000-4000-8000-000000000001');

select isnt_empty(
  $$ select 1 from journey_records
      where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'the traveler reads their own record');

select is(
  (select reflection_answers ->> 'got_wrong' from journey_records
    where journey_id = 'c2000000-0000-4000-8000-000000000001'),
  'the closing time was wrong',
  'and the answers come back as written');

select isnt_empty(
  $$ select 1 from journey_item_notes
      where item_id = 'c3000000-0000-4000-8000-000000000001' $$,
  'and the notes they wrote beside their items');

select lives_ok(
  $$ update journey_records
       set reflection_answers = reflection_answers || '{"do_differently":"start earlier"}'::jsonb
     where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'and can revise a reflection afterwards');

-- Completing is a status move the owner makes; PRD Principle 6 has no other actor.
select lives_ok(
  $$ update journeys set status = 'completed'
      where id = 'c2000000-0000-4000-8000-000000000001' $$,
  'and can mark the journey complete');

-- ── The stranger ────────────────────────────────────────────────────────────
select test_become('c1000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from journey_records
      where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'a stranger sees no record at all');

select is_empty(
  $$ select 1 from journey_item_notes
      where item_id = 'c3000000-0000-4000-8000-000000000001' $$,
  'nor the notes on its items');

select is(
  (select count(*)::int from journey_records
    where journey_id = 'c2000000-0000-4000-8000-000000000001'),
  0,
  'naming the journey directly does not help');

-- A write that matches nothing is not an error, so the assertion is on the row count
-- afterwards rather than on the statement raising.
select lives_ok(
  $$ update journey_records set reflection_answers = '{"got_wrong":"tampered"}'::jsonb
      where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'a stranger''s update touches nothing');

select test_become_postgres();
select is(
  (select reflection_answers ->> 'got_wrong' from journey_records
    where journey_id = 'c2000000-0000-4000-8000-000000000001'),
  'the closing time was wrong',
  'and the reflection is unchanged');

-- ── The admin ───────────────────────────────────────────────────────────────
select test_become('c1000000-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from journey_records
      where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'an admin cannot read reflections — there is no Ops policy on this table');

select is_empty(
  $$ select 1 from journey_item_notes
      where item_id = 'c3000000-0000-4000-8000-000000000001' $$,
  'nor the traveler''s private notes');

select is_empty(
  $$ select 1 from traveler_profiles $$,
  'nor who was travelling at all (CLAUDE.md §5: no Ops path touches traveler_profiles)');

-- ── Anonymous ───────────────────────────────────────────────────────────────
select test_become_anon();

select throws_ok(
  $$ select 1 from journey_records $$,
  '42501',
  null,
  'anonymous has no grant on journey_records at all — RLS never even runs');

select throws_ok(
  $$ insert into journey_records (journey_id, reflection_answers)
     values ('c2000000-0000-4000-8000-000000000001', '{}'::jsonb) $$,
  '42501',
  null,
  'and cannot write a reflection into somebody else''s journey');

-- ── The shape the TRD fixed ─────────────────────────────────────────────────
-- TRD §4.6 names these three keys verbatim. `lib/record.ts` writes them and the reflection
-- route validates them; if either drifts, this is where it shows up rather than in a
-- traveler's lost answer.
select test_become_postgres();

select is(
  (select count(*)::int
     from jsonb_object_keys(
       (select reflection_answers from journey_records
         where journey_id = 'c2000000-0000-4000-8000-000000000001')) as k
    where k in ('most_meaningful', 'do_differently', 'got_wrong')),
  3,
  'reflection_answers carries the three keys the TRD fixed');

select * from finish();
rollback;
