-- pgTAP: a published change reaches journeys WITHOUT Ops ever seeing a traveler (0026).
--
-- Two things are being guarded here and they pull in opposite directions.
--
--   1. Publishing must announce itself, or a corrected temple timing never reaches the
--      person standing at the gate tomorrow morning with the old one in their plan.
--   2. Ops must learn NOTHING about who those people are. `traveler_profiles` has no Ops
--      policy at all, permanently (AUTHORIZATION_MODEL, CLAUDE.md §5).
--
-- `affected_journey_count` is the single `security definer` crossing between them, so most
-- of this file is about what it does not return, and about the fact that opening the door
-- for a count did not open it for anything else.

begin;
select plan(17);

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

-- ── An approver, a traveler, and a support operator ─────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'impact-approver@ops.test'),
  ('f1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'impact-traveler@journeys.test'),
  ('f1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'impact-support@ops.test');

insert into user_roles (user_id, role) values
  ('f1000000-0000-4000-8000-000000000001', 'approver'),
  ('f1000000-0000-4000-8000-000000000003', 'support');

insert into destinations (id, slug, name_i18n, status)
values ('f2000000-0000-4000-8000-000000000001', 'impact-fixture-dest',
        '{"en":"Impact fixture (fixture)"}'::jsonb, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, status)
values ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
        'impact-fixture-temple', '{"en":"Fixture temple (fixture)"}'::jsonb,
        'temple', 'published');

insert into experiences
  (id, destination_id, place_id, slug, name_i18n, experience_type, status)
values ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
        'f3000000-0000-4000-8000-000000000001', 'impact-fixture-aarti',
        '{"en":"Evening aarti (fixture)"}'::jsonb, 'aarti', 'published');

-- One journey that contains it and is still ahead, one that is long over.
insert into journeys (id, owner_user_id, title, start_date, end_date, timezone, status)
values
  ('f5000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002',
   'Upcoming', current_date + 5, current_date + 7, 'Asia/Kolkata', 'upcoming'),
  ('f5000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002',
   'Finished last month', current_date - 40, current_date - 38, 'Asia/Kolkata', 'completed');

insert into journey_items
  (id, journey_id, day_index, sort_order, item_type, tier, experience_id)
values
  ('f6000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001',
   0, 0, 'experience', 'protected', 'f4000000-0000-4000-8000-000000000001'),
  ('f6000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000002',
   0, 0, 'experience', 'protected', 'f4000000-0000-4000-8000-000000000001');

-- ══════════════════════════════════════════════════════════════════════════════
-- The count an approver sees
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('f1000000-0000-4000-8000-000000000001');

select is(
  (affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001') ->> 'total')::int,
  1,
  'an approver sees the live journey that contains this experience');

select is(
  (affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001') ->> 'upcoming')::int,
  1,
  'counted as upcoming rather than active');

-- The finished journey is deliberately not counted: a change to something somebody did
-- last month is not news, and counting it would make every impact number grow forever.
select is(
  (affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001') ->> 'active')::int,
  0,
  'and a journey that is over is not counted at all');

select is(
  (affected_journey_count('places', 'f3000000-0000-4000-8000-000000000001') ->> 'total')::int,
  0,
  'something no journey lists as an item reports zero, not a guess');

-- ── What it must not return ────────────────────────────────────────────────
-- The whole privacy argument for this function rests on the shape of its answer.
select is(
  (select count(*)::int
     from jsonb_object_keys(
       affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001')) as k
    where k not in ('active', 'upcoming', 'total', 'first_start_date')),
  0,
  'it returns four aggregate keys and nothing else — no id, no title, no traveler');

-- ── And the door it opened stays that narrow ───────────────────────────────
select is_empty(
  $$ select 1 from journeys $$,
  'an approver still cannot read journeys');

select is_empty(
  $$ select 1 from journey_items $$,
  'nor their items');

select is_empty(
  $$ select 1 from traveler_profiles $$,
  'nor who is travelling (CLAUDE.md §5)');

select test_become('f1000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ select affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'support cannot read impact — it is an approving decision, not a reading one');

select test_become('f1000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ select affected_journey_count('experiences', 'f4000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'and a traveler certainly cannot count other people''s journeys');

-- ══════════════════════════════════════════════════════════════════════════════
-- Publishing announces itself
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_postgres();

-- A second experience, so publishing it is a fresh event with nothing before it.
insert into experiences
  (id, destination_id, place_id, slug, name_i18n, experience_type, status)
values ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001',
        'f3000000-0000-4000-8000-000000000001', 'impact-fixture-darshan',
        '{"en":"Morning darshan (fixture)"}'::jsonb, 'darshan', 'draft');

-- The publish gate needs availability before an experience can be scheduled at all.
insert into availability_rules (id, experience_id, kind)
values ('f7000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000002',
        'always_during_opening');

insert into trust_records
  (entity_table, entity_id, field_name, source_tier, verification_status, verified_at)
select 'experiences', 'f4000000-0000-4000-8000-000000000002', f, 'T1', 'verified', now()
from unnest(coalesce(critical_fields('experiences'), array[]::text[])) as f;

-- Whole-entity trust for the availability rule, which the gate also checks.
insert into trust_records
  (entity_table, entity_id, field_name, source_tier, verification_status, verified_at)
values ('availability_rules', 'f7000000-0000-4000-8000-000000000001', null,
        'T1', 'verified', now());

select test_become('f1000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select publish_entity('experiences', 'f4000000-0000-4000-8000-000000000002') $$,
  'an approver publishes it');

select test_become_postgres();

select is(
  (select count(*)::int from knowledge_updates
    where entity_id = 'f4000000-0000-4000-8000-000000000002'),
  1,
  'and exactly one knowledge_updates row is written — the announcement');

select is(
  (select destination_id from knowledge_updates
    where entity_id = 'f4000000-0000-4000-8000-000000000002'),
  'f2000000-0000-4000-8000-000000000001',
  'carrying the destination, so a traveler can filter to their own');

-- ── Who may read the announcement ──────────────────────────────────────────
select test_become('f1000000-0000-4000-8000-000000000002');

select isnt_empty(
  $$ select 1 from knowledge_updates $$,
  'a traveler reads it — every row names knowledge that is already published');

select test_become_anon();

select throws_ok(
  $$ select 1 from knowledge_updates $$,
  '42501',
  null,
  'a signed-out visitor does not, because it is only useful to somebody with a journey');

-- ── The traveler's own mark ────────────────────────────────────────────────
select test_become('f1000000-0000-4000-8000-000000000002');

select lives_ok(
  $$ update journeys set knowledge_checked_at = now()
      where id = 'f5000000-0000-4000-8000-000000000001' $$,
  'and can record that their journey has looked');

select test_become('f1000000-0000-4000-8000-000000000001');

select is_empty(
  $$ select 1 from journeys where knowledge_checked_at is not null $$,
  'which an approver cannot see, because they cannot see journeys at all');

select * from finish();
rollback;
