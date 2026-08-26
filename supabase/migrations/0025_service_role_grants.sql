-- 0025_service_role_grants.sql — the backend identity can finally write (found in B-029).
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
-- ══════════════════════════════════════════════════════════════════════════════
--
-- `service_role` held NO table privileges anywhere in `public`. Not on one table — on all
-- 55 of them. `has_table_privilege('service_role', <any table>, 'insert')` was false
-- everywhere, and `set role service_role; insert …` failed with "permission denied".
--
-- Every privileged write in the product therefore did nothing:
--
--   * `lib/notifications.ts` scheduling a journey's reminders (B-027, D-125)
--   * `/api/cron/notifications` recording what it sent
--   * `/api/cron/feeds` writing `live_feed_readings` (B-031)
--   * the report-resolution notification an operator triggers (B-028, D-127)
--
-- All four swallowed the error and reported success, so nothing anywhere said so. A
-- traveler who turned reminders on got none, and the app said the reminders were scheduled.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY NOBODY NOTICED
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Because RLS bypass and table GRANTs are different things, and everything in this repo was
-- reasoning about the first. `service_role` is BYPASSRLS, so every policy question about it
-- has the answer "policies do not apply" — which is true, and irrelevant, because a GRANT
-- is checked first and there was none.
--
-- The tests could not see it either. pgTAP runs as `postgres`, which owns every table; the
-- E2E asserted the routes returned `{ok:true}`, which they did. D-125's earlier fix was
-- real (the request-scoped client genuinely could not insert) but it moved the write from
-- one identity that could not do it to another, and the assertion that caught the first
-- bug was written against the policy rather than against a row appearing.
--
-- `0026_service_role_test.sql` now asserts privileges FOR the role, and the notification
-- and feed writers stop swallowing their errors (see the same commit).
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT THIS GRANTS, AND WHY THAT IS SAFE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Read and write on `public`, which is what 0022 already assumed when it deliberately left
-- `service_role` alone: "the trusted backend identity, it never reaches a browser". The key
-- is server-only, `preflight.mjs` refuses a deploy that exposes it to the browser, and it
-- is already the identity that can bypass RLS — so a grant adds no authority it was not
-- already trusted with.
--
-- This grants no TRUNCATE, REFERENCES or TRIGGER of its own. `service_role` already holds
-- those from Supabase's platform defaults and 0022 deliberately left them ("narrowing it
-- would only mean re-granting later during an operational emergency"); the point here is
-- that nothing NEW is widened — the missing piece was ordinary read and write, and that is
-- all this adds.
--
-- Additive. No policy, table or existing grant is changed.

do $$
declare
  t record;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to service_role',
      t.table_name
    );
  end loop;
end $$;

-- Views too: the cron feed writer reads `v_published_places` to find what to poll for.
do $$
declare
  v record;
begin
  for v in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      -- Skip views an extension owns (pgTAP ships several into `public` on test
      -- databases). Granting on those is refused with a warning and would make every
      -- local migration run look like it half-failed.
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('grant select on public.%I to service_role', v.table_name);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;

-- And for everything created from here on, so the next table does not reintroduce this.
-- Deliberately omits truncate/references/trigger, matching 0022.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Storage is a separate schema with its own owner, and the ingestion runner writes captures
-- there. Supabase grants `service_role` on `storage.objects` by default; asserted in
-- `0026` rather than assumed, because assuming is what produced this migration.
