-- 0022_revoke_default_privileges.sql — least privilege for the client roles (TRD §6.1).
--
-- FOUND IN B-024's SECURITY PASS. Supabase's platform defaults grant ALL on every table in
-- `public` to `anon` and `authenticated`, and this project's migrations grant deliberately
-- on top of that without ever revoking what came for free. So both client roles held
-- TRUNCATE, REFERENCES and TRIGGER on all 68 tables — including `trust_records`, `sources`
-- and `analytics_events`.
--
-- WHY TRUNCATE IS THE ONE THAT MATTERS: **RLS does not apply to it.** Every guarantee this
-- schema makes about who can see or change what is a guarantee about SELECT, INSERT, UPDATE
-- and DELETE. A single TRUNCATE bypasses all of it and empties the table.
--
-- IS IT EXPLOITABLE TODAY? No — PostgREST does not expose TRUNCATE, and there is no path
-- that runs arbitrary SQL as a client role. This is defence in depth, and it is worth having
-- precisely because that answer depends on facts about the API layer rather than on the
-- database. The day a SECURITY INVOKER function or an unwise RPC lands, this stops being
-- theoretical, and nobody would think to check.
--
-- REFERENCES and TRIGGER go for the same reason: a client role has no business adding a
-- foreign key to a table it does not own, or attaching a trigger that runs on someone
-- else's write.
--
-- `service_role` KEEPS these deliberately. It is the trusted backend identity, it never
-- reaches a browser, and narrowing it would only mean re-granting later during an
-- operational emergency — which is the worst possible moment to be editing grants.

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
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      t.table_name
    );
  end loop;
end $$;

-- And for everything created from here on, so this does not have to be remembered.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
