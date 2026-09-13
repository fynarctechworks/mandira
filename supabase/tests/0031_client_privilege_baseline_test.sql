-- pgTAP: 0030 — the client roles hold exactly the declared surface, and new objects start closed.
--
-- These are catalogue assertions on purpose. The defect they guard against was invisible to
-- every behavioural test, because RLS kept returning zero rows while the grant underneath
-- was wide open.

begin;
select plan(9);

select bag_eq(
  $$ select c.relname || ':' || p.priv
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('select'), ('insert'), ('update'), ('delete')) p(priv)
      where n.nspname = 'public'
        and c.relkind = 'r'
        and has_table_privilege('anon', c.oid, p.priv) $$,
  $$ values ('locales:select'), ('feature_flags:select'), ('entity_media:select'),
            ('analytics_events:insert') $$,
  'anon holds table privileges on exactly four tables, and no more');

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and c.relname not like 'v\_published\_%'
        -- Views an extension owns (pgTAP ships some into public on test databases) are not ours.
        and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
        and has_table_privilege('anon', c.oid, 'select') $$,
  'anon reads no view except the published ones');

select bag_eq(
  $$ select p.proname::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        and has_function_privilege('anon', p.oid, 'execute') $$,
  $$ values ('accessibility_for'), ('critical_fields_gated'), ('entity_trust'),
            ('entity_is_published'), ('is_ops'), ('route_stops_for'), ('share_summary') $$,
  'anon can execute exactly seven SECURITY DEFINER functions, each published-only or self-only');

select ok(
  not has_function_privilege('authenticated', 'public.journey_summary_payload(uuid, text)', 'execute'),
  'a signed-in user cannot call the raw journey projection with an arbitrary id');

select ok(
  not has_function_privilege('authenticated',
    'public.open_change_candidate(text, uuid, text, uuid, uuid, text, jsonb)', 'execute'),
  'nor fill the review queue directly');

select ok(
  not has_function_privilege('authenticated',
    'public.record_knowledge_update(text, uuid, uuid, jsonb)', 'execute'),
  'nor announce a knowledge change to travelers');

select ok(
  not has_column_privilege('authenticated', 'public.user_reports', 'user_id', 'select'),
  'the reporter''s identity stays withheld by column');

select is(
  (select count(*)::int
     from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)),
  0,
  'postgres default privileges in public grant the client roles nothing');

create table t31_probe (id int);
select ok(
  not has_table_privilege('anon', 't31_probe', 'select')
    and not has_table_privilege('authenticated', 't31_probe', 'select'),
  'a table created from now on starts closed to both client roles');

select * from finish();
rollback;
