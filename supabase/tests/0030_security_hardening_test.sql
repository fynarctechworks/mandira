-- pgTAP: 0029 security hardening. Every assertion here failed on the schema before 0029.
--
-- The identities are real: `set local role` plus JWT claims, the same pair PostgREST sets,
-- because the original defects were all invisible to tests that ran as `postgres`.

begin;
select plan(32);

-- ── Identities ────────────────────────────────────────────────────────────────

create or replace function t30_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

create or replace function t30_as_anon() returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$$;

-- ── Fixtures (as the owner) ───────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0030.test'),
  ('f3000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver@0030.test'),
  ('f3000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'researcher@0030.test'),
  ('f3000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@0030.test'),
  ('f3000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0030.test'),
  ('f3000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grantee@0030.test');

insert into user_roles (user_id, role) values
  ('f3000000-0000-4000-8000-000000000001', 'editor'),
  ('f3000000-0000-4000-8000-000000000002', 'approver'),
  ('f3000000-0000-4000-8000-000000000003', 'researcher'),
  ('f3000000-0000-4000-8000-000000000004', 'admin');

insert into sources (id, name, source_type, tier)
values ('f3100000-0000-4000-8000-000000000001', 'Temple board (0030)', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status) values
  ('f3200000-0000-4000-8000-000000000001', 'sec-draft', '{"en":"Draft town"}'::jsonb,
   'SRID=4326;POINT(80.0 15.0)', 5, 'draft'),
  ('f3200000-0000-4000-8000-000000000002', 'sec-live', '{"en":"Live town"}'::jsonb,
   'SRID=4326;POINT(80.1 15.1)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location)
values ('f3300000-0000-4000-8000-000000000001', 'f3200000-0000-4000-8000-000000000002',
        'sec-shrine', '{"en":"Shrine"}'::jsonb, 'temple', 'SRID=4326;POINT(80.1 15.1)');

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'f3300000-0000-4000-8000-000000000001', f,
       'f3100000-0000-4000-8000-000000000001', 'T1', 'human_reviewed'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

insert into accessibility_records (place_id, step_free, notes_i18n)
values ('f3300000-0000-4000-8000-000000000001', 'partial', '{"en":"Ramp at the east gate only"}'::jsonb);

insert into media_assets (id, storage_path, media_type, licence, credit)
values ('f3400000-0000-4000-8000-000000000001', 'places/sec-shrine.webp', 'image', 'CC-BY-4.0', 'Board');

insert into entity_media (media_id, entity_table, entity_id, role)
values ('f3400000-0000-4000-8000-000000000001', 'places', 'f3300000-0000-4000-8000-000000000001', 'gallery');

insert into live_feed_configs (id, destination_id, feed_kind, provider, is_enabled) values
  ('f3500000-0000-4000-8000-000000000001', 'f3200000-0000-4000-8000-000000000001', 'weather', 'open-meteo', true),
  ('f3500000-0000-4000-8000-000000000002', 'f3200000-0000-4000-8000-000000000002', 'weather', 'open-meteo', true);

insert into live_feed_readings (feed_config_id, status) values
  ('f3500000-0000-4000-8000-000000000001', 'ok'),
  ('f3500000-0000-4000-8000-000000000002', 'ok');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-2 · A draft is invisible to anonymous callers through every door
-- ══════════════════════════════════════════════════════════════════════════════

select t30_as_anon();

select is(entity_trust('places', 'f3300000-0000-4000-8000-000000000001'), '{}'::jsonb,
  'anon gets no trust metadata for a draft place');
select is(accessibility_for('f3300000-0000-4000-8000-000000000001', null), null,
  'anon gets no accessibility notes for a draft place');
select is_empty(
  $$ select 1 from entity_media where entity_id = 'f3300000-0000-4000-8000-000000000001' $$,
  'anon cannot enumerate a draft place through entity_media');
select is_empty(
  $$ select 1 from media_assets where id = 'f3400000-0000-4000-8000-000000000001' $$,
  'anon cannot read the storage path of an image attached only to a draft');

reset role;
select t30_as('f3000000-0000-4000-8000-000000000005');
select is(entity_trust('places', 'f3300000-0000-4000-8000-000000000001'), '{}'::jsonb,
  'a signed-in traveler gets none either');

reset role;
select t30_as('f3000000-0000-4000-8000-000000000001');
select isnt(entity_trust('places', 'f3300000-0000-4000-8000-000000000001'), '{}'::jsonb,
  'an Ops editor still sees trust on the draft they are working on');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-1 · Nothing but publish_entity() makes something published
-- ══════════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$ update places set status = 'published' where id = 'f3300000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'an editor cannot publish by writing status directly');

select throws_ok(
  $$ update places set published_at = now() where id = 'f3300000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'nor by stamping published_at');

select lives_ok(
  $$ update places set address = 'East gate road' where id = 'f3300000-0000-4000-8000-000000000001' $$,
  'ordinary editing of a draft still works');

reset role;
select t30_as('f3000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ insert into places (destination_id, slug, name_i18n, place_type, location, status)
     values ('f3200000-0000-4000-8000-000000000002', 'sec-born-published', '{"en":"x"}'::jsonb,
             'temple', 'SRID=4326;POINT(80.1 15.1)', 'published') $$,
  '42501', null,
  'a researcher cannot create a row that is born published');

reset role;
select t30_as('f3000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select publish_entity('places', 'f3300000-0000-4000-8000-000000000001') $$,
  'an approver still publishes through the gate');

reset role;
select is((select status::text from places where id = 'f3300000-0000-4000-8000-000000000001'),
  'published', 'and the place is published');

select t30_as('f3000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ update places set address = 'East gate road, near the tank'
      where id = 'f3300000-0000-4000-8000-000000000001' $$,
  'editing an already-published row is still ordinary editorial work');

-- ── S-2 continued: once published, the doors open ─────────────────────────────

reset role;
select t30_as_anon();

select isnt(entity_trust('places', 'f3300000-0000-4000-8000-000000000001'), '{}'::jsonb,
  'anon sees trust once the place is published');
select isnt(accessibility_for('f3300000-0000-4000-8000-000000000001', null), null,
  'and its accessibility');
select isnt_empty(
  $$ select 1 from entity_media where entity_id = 'f3300000-0000-4000-8000-000000000001' $$,
  'and its media link');
select isnt_empty(
  $$ select 1 from media_assets where id = 'f3400000-0000-4000-8000-000000000001' $$,
  'and its image');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-3 · Ops mutations are audited
-- ══════════════════════════════════════════════════════════════════════════════

reset role;
select t30_as('f3000000-0000-4000-8000-000000000001');
set local request.headers = '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}';

update trust_records set evidence_excerpt = 'Board notice, 2026'
 where entity_id = 'f3300000-0000-4000-8000-000000000001' and field_name = 'opening_schedule';

reset role;
set local request.headers = '';

select isnt_empty(
  $$ select 1 from audit_log
      where entity_table = 'trust_records' and action = 'update'
        and actor_user_id = 'f3000000-0000-4000-8000-000000000001' $$,
  'changing a trust record writes an audit entry naming the editor');

select ok(
  (select bool_and(ip_hash is not null and ip_hash !~ '203\.0\.113\.9')
     from audit_log
    where entity_table = 'trust_records'
      and actor_user_id = 'f3000000-0000-4000-8000-000000000001'),
  'the entry carries a hashed address, never the address itself');

select t30_as('f3000000-0000-4000-8000-000000000004');
insert into user_roles (user_id, role) values ('f3000000-0000-4000-8000-000000000006', 'reviewer');
reset role;

select isnt_empty(
  $$ select 1 from audit_log
      where entity_table = 'user_roles' and action = 'insert'
        and entity_id = 'f3000000-0000-4000-8000-000000000006'
        and actor_user_id = 'f3000000-0000-4000-8000-000000000004' $$,
  'granting a role is audited with the grantee and the granting admin');

update sources set notes = 'server-side housekeeping' where id = 'f3100000-0000-4000-8000-000000000001';
select is_empty(
  $$ select 1 from audit_log where entity_table = 'sources' and actor_user_id is null $$,
  'a server identity writing is not recorded as an Ops mutation');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-4 · Travelers cannot reach the audit writer or the publish oracle
-- ══════════════════════════════════════════════════════════════════════════════

select ok(
  not has_function_privilege('authenticated', 'public.record_audit(text, text, uuid, jsonb, jsonb)', 'execute'),
  'authenticated can no longer execute record_audit');

select t30_as('f3000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select validate_for_publish('places', 'f3300000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'a traveler cannot ask whether a draft is ready to publish');

reset role;
select t30_as('f3000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select validate_for_publish('places', 'f3300000-0000-4000-8000-000000000001') $$,
  'an Ops editor still can');
reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-5 · The backend identity does not hold traveler profiles
-- ══════════════════════════════════════════════════════════════════════════════

select ok(
  not has_table_privilege('service_role', 'public.traveler_profiles', 'select'),
  'service_role cannot read traveler_profiles');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-6 · Live conditions follow the destination's publish status
-- ══════════════════════════════════════════════════════════════════════════════

select hasnt_column('public', 'v_published_live_conditions', 'affects_entity_ids',
  'the live conditions view no longer exposes entity ids');

select t30_as_anon();
select is(
  (select count(*)::int from v_published_live_conditions
    where destination_id = 'f3200000-0000-4000-8000-000000000001'),
  0, 'a draft destination''s feed is not shown');
select is(
  (select count(*)::int from v_published_live_conditions
    where destination_id = 'f3200000-0000-4000-8000-000000000002'),
  1, 'a published destination''s feed is');
reset role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-9 · Travelers learn what changed, not who changed it
-- ══════════════════════════════════════════════════════════════════════════════

select ok(
  not has_column_privilege('authenticated', 'public.knowledge_updates', 'published_by', 'select'),
  'authenticated cannot read who published a change');
select ok(
  has_column_privilege('authenticated', 'public.knowledge_updates', 'changed_fields', 'select'),
  'but can still read what changed');

-- ══════════════════════════════════════════════════════════════════════════════
-- S-10 · Definer functions are pinned
-- ══════════════════════════════════════════════════════════════════════════════

select ok(
  (select prosecdef from pg_proc where oid = 'public.publish_entity(text, uuid)'::regprocedure),
  'publish_entity is SECURITY DEFINER');

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )),
  0,
  'every SECURITY DEFINER function in public pins its search_path');

select * from finish();
rollback;
