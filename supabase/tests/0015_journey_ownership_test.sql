-- pgTAP: a journey belongs to exactly one traveler (B-019, PRD-PRIV-002, TRD-DB-003).
--
-- The builder is the first surface that writes traveler data, so this file is about the
-- boundary between two travelers. Every assertion here is a DENIAL: an allow-test failing
-- is an inconvenience, a deny-test failing is someone reading a stranger's journey — and
-- `journey_items` carries where they will be, at what time, on which day.

begin;
select plan(18);

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

-- ── Two travelers, and an operator who is neither ───────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'amma@journeys.test'),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@journeys.test'),
  ('a1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'operator@journeys.test');

insert into user_roles (user_id, role)
values ('a1000000-0000-4000-8000-000000000003', 'admin');

insert into journeys (id, owner_user_id, title, start_date, end_date, timezone)
values ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Amma''s journey', '2026-10-12', '2026-10-14', 'Asia/Kolkata');

insert into journey_items (id, journey_id, day_index, sort_order, item_type, tier)
values ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
        0, 0, 'experience', 'protected');

insert into traveler_profiles (id, owner_user_id, label, mobility, age_band)
values ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Amma', 'limited_walking', 'senior');

insert into journey_travelers (journey_id, traveler_profile_id)
values ('a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001');

-- ── The owner ───────────────────────────────────────────────────────────────
select test_become('a1000000-0000-4000-8000-000000000001');

select isnt_empty($$ select 1 from journeys $$, 'the owner reads their own journey');
select isnt_empty($$ select 1 from journey_items $$, 'and its items');
select isnt_empty($$ select 1 from traveler_profiles $$, 'and their own traveler profiles');
select isnt_empty($$ select 1 from journey_travelers $$, 'and who is coming along');

select lives_ok(
  $$ update journey_items set tier = 'important'
      where id = 'a3000000-0000-4000-8000-000000000001' $$,
  'and can retier an item of their own'
);

-- ── A different traveler ────────────────────────────────────────────────────
select test_become('a1000000-0000-4000-8000-000000000002');

select is_empty($$ select 1 from journeys $$, 'a stranger sees no journey of theirs');
select is_empty(
  $$ select 1 from journey_items $$,
  'nor its items — which say where someone will be, and when'
);
select is_empty($$ select 1 from journey_travelers $$, 'nor who is travelling with them');
select is_empty(
  $$ select 1 from traveler_profiles $$,
  'nor anybody else''s mobility or age band (PRD-PRIV-002)'
);

-- The denials that matter: a stranger who somehow learns an id must still get nowhere.
/*
 * These UPDATEs are permitted to RUN — RLS makes them match nothing rather than raise.
 * That is the point: the statement looks like it worked, and the data is untouched. So
 * each is checked afterwards from outside the stranger's role, which proves the row did
 * not change rather than trusting a reported count.
 */
update journey_items set tier = 'optional'
 where id = 'a3000000-0000-4000-8000-000000000001';
update journey_items set deleted_at = now()
 where id = 'a3000000-0000-4000-8000-000000000001';
update journeys set title = 'mine now'
 where id = 'a2000000-0000-4000-8000-000000000001';

select test_become_postgres();

select is(
  (select tier::text from journey_items where id = 'a3000000-0000-4000-8000-000000000001'),
  'important',
  'a stranger''s update left the item exactly as its owner last set it'
);
select is(
  (select deleted_at from journey_items where id = 'a3000000-0000-4000-8000-000000000001'),
  null,
  'and did not remove it'
);
select is(
  (select title from journeys where id = 'a2000000-0000-4000-8000-000000000001'),
  'Amma''s journey',
  'and did not rename the journey'
);

select test_become('a1000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ insert into journey_items (journey_id, day_index, sort_order, item_type, tier)
     values ('a2000000-0000-4000-8000-000000000001', 0, 9, 'experience', 'optional') $$,
  '42501',
  null,
  'and cannot add an item to a journey that is not theirs'
);

-- ── An admin operator ───────────────────────────────────────────────────────
select test_become('a1000000-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from journeys $$,
  'an ADMIN operator sees no traveler journeys — Ops is not above this line'
);
select is_empty(
  $$ select 1 from traveler_profiles $$,
  'and no traveler profiles at all: the table has no ops policy by design (PRD-PRIV-002)'
);

-- ── A guest ─────────────────────────────────────────────────────────────────
select test_become_anon();

select throws_ok(
  $$ select 1 from journeys $$, '42501', null,
  'a guest is refused journeys outright — guest drafts are device-local (B-023)'
);
select throws_ok(
  $$ select 1 from traveler_profiles $$, '42501', null,
  'and refused traveler profiles'
);

select test_become_postgres();

-- The rule that must survive every future policy edit on these tables.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'traveler_profiles'
     and qual not like '%owner_user_id%'),
  0,
  'every traveler_profiles policy stays owner-scoped; none admits a role'
);

select * from finish();
rollback;
