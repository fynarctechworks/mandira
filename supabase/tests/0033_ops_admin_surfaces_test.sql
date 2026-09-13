-- pgTAP: 0032 — scheduled publishing, version restore, the team, and the two dashboards.

begin;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3300000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@0033.test'),
  ('f3300000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver@0033.test'),
  ('f3300000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0033.test'),
  ('f3300000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Traveler@0033.test');

insert into user_roles (user_id, role) values
  ('f3300000-0000-4000-8000-0000000000c1', 'admin'),
  ('f3300000-0000-4000-8000-0000000000c2', 'approver'),
  ('f3300000-0000-4000-8000-0000000000c3', 'editor');

insert into sources (id, name, source_type, tier)
values ('f3310000-0000-4000-8000-000000000001', 'Temple trust (0033)', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('f3320000-0000-4000-8000-000000000001', 'ops-admin-town', '{"en":"Town","te":"పట్టణం"}'::jsonb,
        'SRID=4326;POINT(80.0 15.0)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location, address) values
  ('f3330000-0000-4000-8000-000000000001', 'f3320000-0000-4000-8000-000000000001', 'sched-shrine',
   '{"en":"Scheduled shrine"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'North gate'),
  ('f3330000-0000-4000-8000-000000000002', 'f3320000-0000-4000-8000-000000000001', 'unready-shrine',
   '{"en":"Unready shrine"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'South gate');

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'f3330000-0000-4000-8000-000000000001', f,
       'f3310000-0000-4000-8000-000000000001', 'T1', 'human_reviewed'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

create or replace function t33_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- ── O21 · The team ────────────────────────────────────────────────────────────

select t33_as('f3300000-0000-4000-8000-0000000000c1');
select is(
  (select count(*)::int from ops_team() where email like '%@0033.test'), 3,
  'an admin sees everyone who holds an Ops role');
select is_empty(
  $$ select 1 from ops_team() where email = 'Traveler@0033.test' $$,
  'and not travelers, who are not Ops''s to browse');
select is(
  (select user_id from ops_find_account('  traveler@0033.TEST ')),
  'f3300000-0000-4000-8000-0000000000c4'::uuid,
  'one exact email finds one account to grant a role to');

reset role;
select t33_as('f3300000-0000-4000-8000-0000000000c3');
select throws_ok($$ select * from ops_team() $$, '42501', null, 'an editor cannot list the team');
select throws_ok($$ select * from ops_find_account('admin@0033.test') $$, '42501', null,
  'nor look accounts up by email');

-- ── O01 / O22 · Dashboards ────────────────────────────────────────────────────

select ok((select knowledge_health() ? 'queues'), 'an editor reads knowledge health');
select is(
  (select (d ->> 'places')::int
     from jsonb_array_elements(knowledge_health() -> 'destinations') d
    where d ->> 'slug' = 'ops-admin-town'),
  0, 'destination depth counts only published places');
select ok((select product_signals(7) ? 'events'), 'and product signals');

reset role;
select t33_as('f3300000-0000-4000-8000-0000000000c4');
select throws_ok($$ select knowledge_health() $$, '42501', null, 'a traveler reads neither dashboard');
select throws_ok($$ select product_signals(7) $$, '42501', null, 'including product signals');

-- ── O20 · Restoring a version ─────────────────────────────────────────────────

reset role;
select t33_as('f3300000-0000-4000-8000-0000000000c3');
update places set address = 'Renamed road' where id = 'f3330000-0000-4000-8000-000000000001';

select lives_ok(
  $$ select restore_entity_version('places', 'f3330000-0000-4000-8000-000000000001', 1) $$,
  'an editor restores the first recorded version');

reset role;
select is(
  (select address from places where id = 'f3330000-0000-4000-8000-000000000001'), 'North gate',
  'and the entity says what it said then');

select t33_as('f3300000-0000-4000-8000-0000000000c4');
select throws_ok(
  $$ select restore_entity_version('places', 'f3330000-0000-4000-8000-000000000001', 1) $$,
  '42501', null, 'a traveler cannot restore anything');

-- ── O13 · Scheduled publishing ────────────────────────────────────────────────

reset role;
select t33_as('f3300000-0000-4000-8000-0000000000c3');
select throws_ok(
  $$ select schedule_publish('places', 'f3330000-0000-4000-8000-000000000001', now() + interval '1 day') $$,
  '42501', null, 'an editor cannot schedule a publish');

reset role;
select t33_as('f3300000-0000-4000-8000-0000000000c2');
select throws_ok(
  $$ select schedule_publish('places', 'f3330000-0000-4000-8000-000000000001', now() - interval '1 hour') $$,
  '22023', null, 'a schedule in the past is refused');
select throws_ok(
  $$ select schedule_publish('places', 'f3330000-0000-4000-8000-000000000002', now() + interval '1 day') $$,
  '23514', null, 'something not ready to publish cannot be scheduled either');
select lives_ok(
  $$ select schedule_publish('places', 'f3330000-0000-4000-8000-000000000001', now() + interval '1 day') $$,
  'an approver schedules a valid place');

-- Time passes: bring the schedule due, and make the other place's schedule stale-invalid.
reset role;
update publish_schedules set publish_at = now() - interval '1 minute'
 where entity_id = 'f3330000-0000-4000-8000-000000000001';
insert into publish_schedules (entity_table, entity_id, publish_at, scheduled_by)
values ('places', 'f3330000-0000-4000-8000-000000000002', now() - interval '1 minute',
        'f3300000-0000-4000-8000-0000000000c2');

select is(
  publish_scheduled_entities(),
  '{"published": 1, "blocked": 1}'::jsonb,
  'the job publishes what is still valid and blocks what is not');
select is(
  (select status::text from places where id = 'f3330000-0000-4000-8000-000000000001'), 'published',
  'the scheduled place is live');
select is(
  (select published_by from knowledge_updates where entity_id = 'f3330000-0000-4000-8000-000000000001'),
  'f3300000-0000-4000-8000-0000000000c2'::uuid,
  'announced in the approver''s name, exactly as an immediate publish would be');
select is(
  (select status from publish_schedules where entity_id = 'f3330000-0000-4000-8000-000000000002'),
  'blocked', 'the invalid one is marked blocked');
select ok(
  not has_function_privilege('authenticated', 'public.publish_entity_as(text, uuid, uuid)', 'execute'),
  'nobody can publish in someone else''s name');

select * from finish();
rollback;
