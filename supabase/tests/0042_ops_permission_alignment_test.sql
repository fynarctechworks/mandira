-- 0042 · what an Ops screen offers a role, the database lets that role do — and no more
begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4200000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'researcher@0042.test'),
  ('f4200000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0042.test'),
  ('f4200000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@0042.test'),
  ('f4200000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verifier@0042.test'),
  ('f4200000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver@0042.test'),
  ('f4200000-0000-4000-8000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'media@0042.test');

insert into user_roles (user_id, role) values
  ('f4200000-0000-4000-8000-0000000000a1', 'researcher'),
  ('f4200000-0000-4000-8000-0000000000a2', 'editor'),
  ('f4200000-0000-4000-8000-0000000000a3', 'reviewer'),
  ('f4200000-0000-4000-8000-0000000000a4', 'verifier'),
  ('f4200000-0000-4000-8000-0000000000a5', 'approver'),
  ('f4200000-0000-4000-8000-0000000000a6', 'media');

insert into sources (id, name, source_type, tier)
values ('f4210000-0000-4000-8000-000000000001', 'Temple trust (0042)', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('f4220000-0000-4000-8000-000000000001', 'perm-town-0042', '{"en":"Town"}'::jsonb,
        'SRID=4326;POINT(80.0 15.0)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location, address, status) values
  ('f4230000-0000-4000-8000-000000000001', 'f4220000-0000-4000-8000-000000000001', 'stop-one-0042',
   '{"en":"Stop one"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'North gate', 'in_review'),
  ('f4230000-0000-4000-8000-000000000002', 'f4220000-0000-4000-8000-000000000001', 'stop-two-0042',
   '{"en":"Stop two"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'South gate', 'draft');

insert into routes (id, destination_id, slug, name_i18n, mode, status)
values ('f4240000-0000-4000-8000-000000000001', 'f4220000-0000-4000-8000-000000000001',
        'hill-path-0042', '{"en":"Hill path"}'::jsonb, 'walk', 'draft');

insert into media_assets (id, storage_path, media_type, licence)
values ('f4250000-0000-4000-8000-000000000001', 'media/0042.jpg', 'image', 'CC-BY');

create or replace function t42_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- ── Route stops: one edit, for the people who edit routes ─────────────────────────────

select t42_as('f4200000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ select set_route_stops('f4240000-0000-4000-8000-000000000001',
       '[{"place_id":"f4230000-0000-4000-8000-000000000002"},
         {"place_id":"f4230000-0000-4000-8000-000000000001","is_rest_point":true}]'::jsonb) $$,
  'a researcher can set a route''s stops');
select lives_ok(
  $$ select set_route_stops('f4240000-0000-4000-8000-000000000001',
       '[{"place_id":"f4230000-0000-4000-8000-000000000001"},
         {"place_id":"f4230000-0000-4000-8000-000000000002"}]'::jsonb) $$,
  'and set them again');

reset role;
select results_eq(
  $$ select place_id from route_places
     where route_id = 'f4240000-0000-4000-8000-000000000001' order by sort_order $$,
  $$ values ('f4230000-0000-4000-8000-000000000001'::uuid), ('f4230000-0000-4000-8000-000000000002'::uuid) $$,
  'the second list replaced the first, in its own order, with nothing doubled');
select ok(
  exists (select 1 from audit_log where action = 'route_stops_set'
          and entity_id = 'f4240000-0000-4000-8000-000000000001'),
  'and the change is in the audit log');

select t42_as('f4200000-0000-4000-8000-0000000000a6');
select throws_ok(
  $$ select set_route_stops('f4240000-0000-4000-8000-000000000001', '[]'::jsonb) $$,
  '42501', null, 'the media role cannot edit a route');

-- ── Removing a rule or a connection ─────────────────────────────────────────────────────

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ select delete_knowledge_row('availability_rules', gen_random_uuid()) $$,
  '42501', null, 'a researcher cannot remove an availability rule');

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a2');
select is(
  delete_knowledge_row('transport_connections', gen_random_uuid()), false,
  'an editor can, and is told when there was nothing to remove');
select throws_ok(
  $$ select delete_knowledge_row('places', 'f4230000-0000-4000-8000-000000000001') $$,
  '22023', null, 'nothing but the two removable tables can be removed this way');

-- ── A reviewer's reject ─────────────────────────────────────────────────────────────────

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a3');
select is(
  return_to_draft('places', 'f4230000-0000-4000-8000-000000000001'), true,
  'a reviewer can return an item in review to draft');
select is(
  return_to_draft('places', 'f4230000-0000-4000-8000-000000000002'), false,
  'but only out of review');
update places set name_i18n = '{"en":"Renamed"}'::jsonb where id = 'f4230000-0000-4000-8000-000000000002';

reset role;
select is(
  (select status::text from places where id = 'f4230000-0000-4000-8000-000000000001'), 'draft',
  'the returned item is a draft');
select is(
  (select name_i18n ->> 'en' from places where id = 'f4230000-0000-4000-8000-000000000002'), 'Stop two',
  'and a reviewer still cannot edit the content itself');

-- ── The media library ──────────────────────────────────────────────────────────────────

select t42_as('f4200000-0000-4000-8000-0000000000a6');
select lives_ok(
  $$ insert into entity_media (media_id, entity_table, entity_id, role)
     values ('f4250000-0000-4000-8000-000000000001', 'places',
             'f4230000-0000-4000-8000-000000000001', 'hero') $$,
  'the media role can attach an image');
select lives_ok(
  $$ update media_assets set deleted_at = now() where id = 'f4250000-0000-4000-8000-000000000001' $$,
  'and archive one');

reset role;
select isnt(
  (select deleted_at from media_assets where id = 'f4250000-0000-4000-8000-000000000001'), null,
  'the archive really happened');

-- ── Trust statuses by role (PRD F18) ────────────────────────────────────────────────────

select t42_as('f4200000-0000-4000-8000-0000000000a1');
select lives_ok(
  $$ insert into trust_records (entity_table, entity_id, field_name, verification_status)
     values ('places', 'f4230000-0000-4000-8000-000000000001', 'opening_schedule', 'unverified') $$,
  'a researcher can record a field as unverified');
select throws_ok(
  $$ insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
     values ('places', 'f4230000-0000-4000-8000-000000000001', 'closure_rules_i18n',
             'f4210000-0000-4000-8000-000000000001', 'T1', 'human_reviewed') $$,
  '42501', null, 'but cannot accept one as reviewed');

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a3');
select throws_ok(
  $$ update trust_records
        set verification_status = 'verified', source_id = 'f4210000-0000-4000-8000-000000000001',
            source_tier = 'T1', verified_at = now()
      where entity_id = 'f4230000-0000-4000-8000-000000000001' and field_name = 'opening_schedule' $$,
  '42501', null, 'a reviewer cannot verify');

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a4');
select lives_ok(
  $$ update trust_records
        set verification_status = 'verified', source_id = 'f4210000-0000-4000-8000-000000000001',
            source_tier = 'T1', verified_at = now()
      where entity_id = 'f4230000-0000-4000-8000-000000000001' and field_name = 'opening_schedule' $$,
  'a verifier can');

reset role;
select t42_as('f4200000-0000-4000-8000-0000000000a5');
select throws_ok(
  $$ insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status, verified_at)
     values ('places', 'f4230000-0000-4000-8000-000000000001', 'entry_requirements_i18n',
             'f4210000-0000-4000-8000-000000000001', 'T1', 'verified', now()) $$,
  '42501', null, 'an approver approves what is verified, and does not verify it');

reset role;
select * from finish();
rollback;
