-- pgTAP: the backend identity can do the writes the product depends on (0025).
--
-- WHY THIS FILE EXISTS. `service_role` held no table privileges anywhere in `public` — all
-- 55 tables — so every privileged write in the product silently did nothing: journey
-- reminders were never scheduled, live feed readings were never stored, report-resolution
-- notifications were never queued. Each caller discarded the error and reported success.
--
-- Nothing could see it. pgTAP runs as `postgres`, which OWNS every table, so every existing
-- assertion about "can this write happen" was answered by the wrong identity. The E2E
-- asserted the routes returned `{ok:true}`, which they truthfully did.
--
-- So the assertions below do the one thing that was missing: they ask about the ROLE.
-- `has_table_privilege('service_role', …)` and an actual `set role service_role` write,
-- rather than a policy read as somebody else.

begin;
select plan(15);

-- ══════════════════════════════════════════════════════════════════════════════
-- The privilege, asked about directly
-- ══════════════════════════════════════════════════════════════════════════════

select ok(
  has_table_privilege('service_role', 'public.notifications', 'insert'),
  'service_role can insert notifications (B-027 scheduling)');

select ok(
  has_table_privilege('service_role', 'public.notifications', 'update'),
  'and update them, which is how a send is recorded');

select ok(
  has_table_privilege('service_role', 'public.live_feed_readings', 'insert'),
  'and insert live feed readings (B-031)');

select ok(
  has_table_privilege('service_role', 'public.ingestion_jobs', 'insert'),
  'and start an ingestion run (B-029)');

select ok(
  has_table_privilege('service_role', 'public.source_captures', 'insert'),
  'and store the capture it fetched');

select ok(
  has_table_privilege('service_role', 'storage.objects', 'insert'),
  'and write the capture body into storage');

-- Not one table: EVERY table. The bug was uniform, so the assertion is too — a single
-- table that gets missed by a future migration is the same failure again.
/*
 * Catalog OIDs, not `information_schema.tables`. The planner is free to evaluate
 * `has_table_privilege(format('public.%I', table_name), …)` on rows the schema filter would
 * have excluded, and it does — the query dies on `vault.decrypted_secrets`. An OID cannot
 * be resolved to the wrong relation.
 */
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not has_table_privilege('service_role', c.oid, 'insert')),
  0,
  'there is no table in public that service_role cannot write');

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not has_table_privilege('service_role', c.oid, 'select')),
  0,
  'nor one it cannot read');

-- ══════════════════════════════════════════════════════════════════════════════
-- The privilege, exercised
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `has_table_privilege` is the right question and still not the whole one: the write has to
-- actually work as that role. This is the assertion that would have caught the original
-- bug regardless of how it was reasoned about.

insert into auth.users (id, instance_id, aud, role, email)
values ('e1000000-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'service-role-probe@mandhira.test');

set local role service_role;

select lives_ok(
  $$ insert into notifications
       (user_id, notification_type, channel, title_i18n, body_i18n, scheduled_for)
     values ('e1000000-0000-4000-8000-000000000001', 'suggestion', 'inapp',
             '{"en":"probe"}'::jsonb, '{"en":"probe"}'::jsonb, now()) $$,
  'a notification really can be written as service_role');

select is(
  (select count(*)::int from notifications
    where user_id = 'e1000000-0000-4000-8000-000000000001'),
  1,
  'and the row is actually there — the assertion the original bug slipped past');

reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- The client roles are unchanged
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 0025 widens exactly one identity. If it had widened `anon` or `authenticated` on the way
-- past, that would be a far worse bug than the one it fixed.

select ok(
  not has_table_privilege('anon', 'public.notifications', 'insert'),
  'anon still cannot write a notification');

select ok(
  not has_table_privilege('anon', 'public.trust_records', 'select'),
  'and still cannot read trust records directly');

-- 0022's revocation, re-asserted here because 0025 touches grants in the same schema.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'truncate')
           or has_table_privilege('authenticated', c.oid, 'truncate'))),
  0,
  'no client role regained TRUNCATE, which RLS does not apply to (0022)');

/*
 * The capture BODY is service-role only. The `source_captures` row is writable by Ops
 * roles (0008 grants the five pipeline tables to `authenticated` behind a role policy),
 * which is a deliberate difference: an operator can record that a capture happened, but
 * cannot put bytes in the private bucket and call them evidence somebody fetched.
 */
select is_empty(
  $$ select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd = 'INSERT' and qual is not distinct from null
        and policyname like 'captures%' $$,
  'no policy lets an operator write into the captures bucket by hand');

select ok(
  has_table_privilege('service_role', 'storage.objects', 'insert'),
  'only the runner, under the service role, puts a capture body in storage');

select * from finish();
rollback;
