-- pgTAP: TRD §4.9 RLS matrix, table × role (TRD-DB-003, PRD-PRIV-002).
--
-- Everything runs inside one transaction and rolls back, so the fixtures below never
-- persist. Identity is simulated the way PostgREST does it: `set local role` plus a
-- `request.jwt.claims` setting that auth.uid() reads.
--
-- The tests that matter most are the DENIALS. An allow-test failing is an inconvenience;
-- a deny-test failing is a data breach.

begin;
select plan(33);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
-- Users must exist in auth.users because journeys/profiles reference it.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'traveler-a@example.test'),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'traveler-b@example.test'),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ops-admin@example.test'),
  ('a0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ops-support@example.test');

insert into user_roles (user_id, role) values
  ('a0000000-0000-4000-8000-000000000003', 'admin'),
  ('a0000000-0000-4000-8000-000000000004', 'support');

insert into profiles (id, display_name) values
  ('a0000000-0000-4000-8000-000000000001', 'Traveler A'),
  ('a0000000-0000-4000-8000-000000000002', 'Traveler B');

-- Traveler A's private data.
insert into traveler_profiles (id, owner_user_id, label, mobility, age_band)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'Amma', 'limited_walking', 'senior');

insert into journeys (id, owner_user_id, title)
values ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'A journey');

insert into journey_items (id, journey_id, item_type, tier)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'experience', 'important');

insert into user_reports (id, user_id, reporter_hash, report_type, entity_table, entity_id, description)
values ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'hash-of-a', 'timing_changed', 'places',
        'f0000000-0000-4000-8000-000000000001', 'Evening aarti moved');

insert into destinations (id, slug, name_i18n, status)
values ('f0000000-0000-4000-8000-000000000002', 'rls-draft', '{"en":"Draft"}'::jsonb, 'draft');

-- Identity helpers.
create or replace function test_become(p_user uuid) returns void
language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

create or replace function test_become_anon() returns void
language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$$;

create or replace function test_become_postgres() returns void
language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Anonymous
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_anon();

select throws_ok(
  'select * from journeys', '42501', null,
  'anon cannot read journeys at all'
);
select throws_ok(
  'select * from traveler_profiles', '42501', null,
  'anon cannot read traveler_profiles at all'
);
select throws_ok(
  'select * from destinations', '42501', null,
  'anon cannot read the destinations base table'
);
select is_empty(
  'select 1 from v_published_destinations',
  'anon sees no unpublished content through the view'
);
select isnt_empty(
  'select 1 from locales',
  'anon can read locales'
);
select lives_ok(
  $$ insert into analytics_events (event_name, anon_session_id) values ('probe', 'sess-1') $$,
  'anon can insert an analytics event'
);
select throws_ok(
  'select * from analytics_events', '42501', null,
  'anon cannot read analytics events back (insert-only by design)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Traveler A — own data
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('a0000000-0000-4000-8000-000000000001'::uuid);

select is(
  (select count(*)::int from journeys), 1,
  'traveler A sees their own journey'
);
select is(
  (select count(*)::int from journey_items), 1,
  'traveler A sees items of their own journey'
);
select is(
  (select count(*)::int from traveler_profiles), 1,
  'traveler A sees their own traveler profile'
);
select is(
  (select count(*)::int from profiles), 1,
  'traveler A sees only their own profile row'
);
select is(
  (select count(*)::int from user_reports), 1,
  'traveler A sees their own report'
);
select throws_ok(
  'select user_id from user_reports', '42501', null,
  'nobody can select user_id from user_reports — the column grant withholds it'
);
/*
 * Note how this differs from anon above. A signed-in traveler DOES hold the table grant,
 * because it is granted to `authenticated` and Ops users are authenticated too. The query
 * therefore succeeds and returns nothing, because the ops-only policy matches no rows.
 * Empty is the denial here, not an error — which is why this asserts emptiness rather
 * than a 42501.
 */
select is_empty(
  'select 1 from destinations',
  'a signed-in non-Ops traveler reads no rows from base knowledge tables (views only)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Traveler B — the IDOR cases. These are the tests that must never regress.
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('a0000000-0000-4000-8000-000000000002'::uuid);

select is(
  (select count(*)::int from journeys), 0,
  'traveler B cannot see traveler A''s journey'
);
select is(
  (select count(*)::int from journey_items), 0,
  'traveler B cannot see items inside traveler A''s journey'
);
select is(
  (select count(*)::int from traveler_profiles), 0,
  'traveler B cannot see traveler A''s traveler profiles'
);
select is(
  (select count(*)::int from user_reports), 0,
  'traveler B cannot see traveler A''s report'
);
select is(
  (select count(*)::int from profiles where id <> (select auth.uid())), 0,
  'traveler B cannot see another user''s profile'
);

-- Writing into someone else's journey must fail the WITH CHECK, not silently succeed.
select throws_ok(
  $$ insert into journey_items (journey_id, item_type, tier)
     values ('c0000000-0000-4000-8000-000000000001', 'experience', 'optional') $$,
  '42501',
  null,
  'traveler B cannot insert an item into traveler A''s journey'
);

-- Updating another user's journey must affect zero rows.
update journeys set title = 'hijacked' where id = 'c0000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from journeys where title = 'hijacked'), 0,
  'traveler B''s update of traveler A''s journey matches no rows'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Ops admin — broad Ops powers, but NOT traveler data
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('a0000000-0000-4000-8000-000000000003'::uuid);

select isnt_empty(
  'select 1 from destinations',
  'an Ops role can read the knowledge base tables'
);
select is(
  (select count(*)::int from profiles), 2,
  'admin can read all profiles (§4.9 allows profiles, and only profiles)'
);

/*
 * The single most important assertion in this file.
 *
 * PRD-PRIV-002 and AUTHORIZATION_MODEL both state that no Ops path may reach
 * traveler_profiles. It is enforced by the ABSENCE of any ops policy — so this test
 * fails the moment someone "helpfully" adds one.
 */
select is(
  (select count(*)::int from traveler_profiles), 0,
  'ADMIN CANNOT SEE traveler_profiles — mobility/age never reach Ops (PRD-PRIV-002)'
);

select is(
  (select count(*)::int from journeys), 0,
  'admin cannot read traveler journeys'
);
select is(
  (select count(*)::int from journey_items), 0,
  'admin cannot read traveler journey items'
);
select is(
  (select count(*)::int from notifications), 0,
  'admin cannot read traveler notifications'
);

-- Audit history is append-only even for an admin.
select throws_ok(
  $$ delete from audit_log $$, '42501', null,
  'admin cannot delete audit_log rows — the trail is append-only'
);
select throws_ok(
  $$ update entity_versions set snapshot = '{}'::jsonb $$, '42501', null,
  'admin cannot rewrite entity_versions'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Ops support — reports queue only
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('a0000000-0000-4000-8000-000000000004'::uuid);

select is(
  (select count(*)::int from user_reports), 1,
  'support can read the reports queue'
);
select is(
  (select count(*)::int from traveler_profiles), 0,
  'support cannot see traveler_profiles either'
);
select throws_ok(
  $$ insert into user_roles (user_id, role)
     values ('a0000000-0000-4000-8000-000000000004', 'admin') $$,
  '42501',
  null,
  'a non-admin cannot grant themselves the admin role'
);

select test_become_postgres();

/*
 * The anonymous attack surface, enumerated.
 *
 * Every other test here checks a specific door. This one checks that no NEW door has
 * appeared: it lists every policy reachable by `anon` and compares it to the intended
 * set. A future migration that exposes a table to the public internet fails here even if
 * nobody thought to write a test for that table.
 */
select bag_eq(
  $$ select tablename || ':' || cmd
       from pg_policies
      where schemaname = 'public' and 'anon' = any(roles) $$,
  $$ values
       ('locales:SELECT'),
       ('media_assets:SELECT'),
       ('entity_media:SELECT'),
       ('feature_flags:SELECT'),
       ('analytics_events:INSERT') $$,
  'the set of anon-reachable policies is exactly the intended five'
);

select * from finish();
rollback;
