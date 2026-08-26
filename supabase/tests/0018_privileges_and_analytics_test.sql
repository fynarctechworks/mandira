-- pgTAP: least privilege, and analytics that cannot identify anyone
-- (B-024, TRD §6.1, PRD-ANLY-001, TRD §4.7).
--
-- Two things this file pins, both found or hardened during B-024's quality pass.
--
-- 1. TRUNCATE. Supabase's platform defaults grant ALL on every public table to `anon` and
--    `authenticated`, and this project's migrations granted deliberately on top without
--    revoking what came free. **RLS does not apply to TRUNCATE** — every guarantee this
--    schema makes is about SELECT/INSERT/UPDATE/DELETE, and one TRUNCATE bypasses the lot.
--    Not reachable through PostgREST today, which is exactly why it needs a test: that
--    answer depends on facts about the API layer, not about the database.
--
-- 2. `analytics_events` has nowhere to put a person. PRD-ANLY-001's acceptance is "zero
--    user identifiers, schema-tested", and this is that test.

begin;
select plan(12);

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

-- ══════════════════════════════════════════════════════════════════════════════
-- Least privilege on the client roles.
-- ══════════════════════════════════════════════════════════════════════════════

-- Counted over BASE TABLES only. A view cannot be truncated — Postgres refuses outright —
-- so a lingering grant on one is noise rather than exposure.
select is(
  (select count(*)::int
     from information_schema.role_table_grants g
     join information_schema.tables t
       on t.table_schema = g.table_schema and t.table_name = g.table_name
    where g.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and g.privilege_type = 'TRUNCATE'
      and g.grantee in ('anon', 'authenticated')),
  0,
  'no client role can TRUNCATE any table — RLS does not apply to it'
);

select is(
  (select count(*)::int
     from information_schema.role_table_grants g
     join information_schema.tables t
       on t.table_schema = g.table_schema and t.table_name = g.table_name
    where g.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and g.privilege_type in ('REFERENCES', 'TRIGGER')
      and g.grantee in ('anon', 'authenticated')),
  0,
  'nor attach a trigger to, or reference, a table it does not own'
);

-- The named tables, spelled out. If the sweep above is ever narrowed, these still fail.
select ok(
  not has_table_privilege('anon', 'trust_records', 'TRUNCATE'),
  'anon cannot empty the trust records the whole publish gate rests on'
);

select ok(
  not has_table_privilege('authenticated', 'journeys', 'TRUNCATE'),
  'a signed-in traveler cannot empty everyone''s journeys'
);

select ok(
  not has_table_privilege('anon', 'analytics_events', 'TRUNCATE'),
  'and nobody can quietly erase the measurements'
);

-- The grants that must SURVIVE, so this hardening cannot silently break the app.
select ok(
  has_table_privilege('anon', 'analytics_events', 'INSERT'),
  'anon can still record an event — the funnel starts before anyone signs in'
);

select ok(
  has_table_privilege('authenticated', 'journeys', 'SELECT'),
  'and a traveler can still read their own journeys'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Analytics cannot identify anyone (PRD-ANLY-001).
-- ══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analytics_events'
      and column_name in ('user_id', 'owner_user_id', 'email', 'ip', 'ip_hash', 'device_id')),
  0,
  'analytics_events has no column that could hold a person'
);

select hasnt_column('analytics_events', 'user_id',
  'and specifically no user_id, however convenient it would be');

-- The one table Ops must never reach, asserted from the analytics side too.
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analytics_events'
      and column_name like '%traveler%'),
  0,
  'nor anything joining it to traveler_profiles'
);

-- ── A guest can write, and cannot read back ─────────────────────────────────
select test_become_anon();

insert into analytics_events (event_name, anon_session_id, properties)
values ('live_opened', 'abc123', '{"card_kind":"item"}'::jsonb);

-- Stronger than an RLS filter: `anon` holds INSERT and no SELECT at all, so the read is
-- refused before any policy is consulted. Write-only, which is what an analytics endpoint
-- should be from the public side.
select throws_ok(
  $$ select 1 from analytics_events $$,
  '42501',
  null,
  'a guest can record an event and cannot read the table back at all'
);

-- ── A signed-in traveler is no different ────────────────────────────────────
-- Back to the superuser to create the fixture: `anon` cannot write to `auth.users`, which
-- is itself correct and would otherwise fail here for the wrong reason.
reset role;

insert into auth.users (id, instance_id, aud, role, email)
values ('d1000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'traveler@analytics.test');

select test_become('d1000000-0000-4000-8000-000000000001');

select is_empty(
  $$ select 1 from analytics_events $$,
  'and neither can a signed-in traveler without an Ops role'
);

select * from finish();
rollback;
