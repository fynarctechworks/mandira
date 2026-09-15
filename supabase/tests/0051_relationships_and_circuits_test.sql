-- pgTAP: 0051 — Ops replaces nearby links and circuit order in one step, sees what a place is
-- connected to, and every change is audited; travelers can do none of it.
begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5100000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'researcher@0051.test'),
  ('f5100000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0051.test');

insert into user_roles (user_id, role) values ('f5100000-0000-4000-8000-0000000000a1', 'researcher');

insert into destinations (id, slug, name_i18n) values
  ('f5110000-0000-4000-8000-000000000001', 't51-d1', '{"en":"T51 One"}'),
  ('f5110000-0000-4000-8000-000000000002', 't51-d2', '{"en":"T51 Two"}'),
  ('f5110000-0000-4000-8000-000000000003', 't51-d3', '{"en":"T51 Three"}');

insert into circuits (id, slug, name_i18n)
values ('f5120000-0000-4000-8000-000000000001', 't51-circuit', '{"en":"T51 Circuit"}');

insert into places (id, destination_id, slug, name_i18n, place_type, facility_subtype, location) values
  ('f5130000-0000-4000-8000-000000000001', 'f5110000-0000-4000-8000-000000000001', 't51-temple',
   '{"en":"T51 Temple"}', 'temple', null, st_setsrid(st_makepoint(83.0100, 25.3100), 4326)::geography),
  ('f5130000-0000-4000-8000-000000000002', 'f5110000-0000-4000-8000-000000000001', 't51-restroom',
   '{"en":"T51 Restroom"}', 'facility', 'restroom', st_setsrid(st_makepoint(83.0100, 25.3118), 4326)::geography),
  ('f5130000-0000-4000-8000-000000000003', 'f5110000-0000-4000-8000-000000000001', 't51-far-water',
   '{"en":"T51 Far water"}', 'facility', 'drinking_water', st_setsrid(st_makepoint(83.0100, 25.3300), 4326)::geography);

insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type)
values ('f5140000-0000-4000-8000-000000000001', 'f5110000-0000-4000-8000-000000000001',
        'f5130000-0000-4000-8000-000000000001', 't51-darshan', '{"en":"T51 Darshan"}',
        (enum_range(null::experience_type_enum))[1]);

insert into routes (id, destination_id, slug, name_i18n, mode)
values ('f5150000-0000-4000-8000-000000000001', 'f5110000-0000-4000-8000-000000000001',
        't51-route', '{"en":"T51 Route"}', (enum_range(null::travel_mode_enum))[1]);
insert into route_places (route_id, place_id, sort_order)
values ('f5150000-0000-4000-8000-000000000001', 'f5130000-0000-4000-8000-000000000001', 0);

create or replace function t51_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- ── Nearby destinations ──────────────────────────────────────────────────────

select t51_as('f5100000-0000-4000-8000-0000000000a1');

select lives_ok($$
  select set_destination_links('f5110000-0000-4000-8000-000000000001', '[
    {"nearby_destination_id":"f5110000-0000-4000-8000-000000000002","note_i18n":{"en":"Two hours by road"}},
    {"nearby_destination_id":"f5110000-0000-4000-8000-000000000003"}
  ]'::jsonb) $$, 'a researcher links two nearby destinations');
select is(
  (select note_i18n ->> 'en' from destination_links
    where destination_id = 'f5110000-0000-4000-8000-000000000001'
      and nearby_destination_id = 'f5110000-0000-4000-8000-000000000002'),
  'Two hours by road', 'with the note travelers will read');

select lives_ok($$
  select set_destination_links('f5110000-0000-4000-8000-000000000001',
    '[{"nearby_destination_id":"f5110000-0000-4000-8000-000000000002"}]'::jsonb) $$,
  'and replaces the set with one');
select is(
  (select count(*)::int from destination_links where destination_id = 'f5110000-0000-4000-8000-000000000001'),
  1, 'which removes the other, though the researcher cannot delete rows directly');

select throws_ok($$
  select set_destination_links('f5110000-0000-4000-8000-000000000001',
    '[{"nearby_destination_id":"f5110000-0000-4000-8000-000000000001"}]'::jsonb) $$,
  '23514', null, 'a destination is never nearby itself');
select throws_ok($$
  select set_destination_links('f5110000-0000-4000-8000-000000000001', '[
    {"nearby_destination_id":"f5110000-0000-4000-8000-000000000002"},
    {"nearby_destination_id":"f5110000-0000-4000-8000-000000000002"}]'::jsonb) $$,
  '23514', null, 'nor listed twice');

-- ── Circuits ─────────────────────────────────────────────────────────────────

select lives_ok($$
  select set_circuit_destinations('f5120000-0000-4000-8000-000000000001',
    array['f5110000-0000-4000-8000-000000000002', 'f5110000-0000-4000-8000-000000000001']::uuid[]) $$,
  'a researcher sets a circuit''s destinations');
select is(
  (select string_agg(d.slug, ',' order by cd.sort_order)
     from circuit_destinations cd join destinations d on d.id = cd.destination_id
    where cd.circuit_id = 'f5120000-0000-4000-8000-000000000001'),
  't51-d2,t51-d1', 'in the order given');
select lives_ok($$
  select set_circuit_destinations('f5120000-0000-4000-8000-000000000001',
    array['f5110000-0000-4000-8000-000000000001']::uuid[]) $$, 'and replaces them');
select throws_ok($$
  select set_circuit_destinations('f5120000-0000-4000-8000-000000000001',
    array['f5110000-0000-4000-8000-000000000001', 'f5110000-0000-4000-8000-000000000001']::uuid[]) $$,
  '23514', null, 'a destination is in a circuit once');

-- ── Connections ──────────────────────────────────────────────────────────────

select ok(
  (ops_place_connections('f5130000-0000-4000-8000-000000000001') -> 'experiences')
    @> '[{"id":"f5140000-0000-4000-8000-000000000001"}]',
  'a place lists the experience held there');
select ok(
  (ops_place_connections('f5130000-0000-4000-8000-000000000001') -> 'routes')
    @> '[{"id":"f5150000-0000-4000-8000-000000000001","stop":1}]',
  'the route that stops there, and which stop it is');
select ok(
  (ops_place_connections('f5130000-0000-4000-8000-000000000001') -> 'facilities')
      @> '[{"id":"f5130000-0000-4000-8000-000000000002","subtype":"restroom"}]'
    and not (ops_place_connections('f5130000-0000-4000-8000-000000000001') -> 'facilities')
      @> '[{"id":"f5130000-0000-4000-8000-000000000003"}]',
  'and the facility within 500 metres, but not the one two kilometres away');
reset role;

select ok(
  (select count(*) from audit_log
    where action in ('destination_links_set', 'circuit_destinations_set')
      and entity_id in ('f5110000-0000-4000-8000-000000000001', 'f5120000-0000-4000-8000-000000000001')) = 4,
  'every replacement is audited');

-- ── Travelers ────────────────────────────────────────────────────────────────

select t51_as('f5100000-0000-4000-8000-0000000000a2');
select throws_ok($$
  select set_destination_links('f5110000-0000-4000-8000-000000000001', '[]'::jsonb) $$,
  '42501', null, 'a traveler cannot change nearby links');
select throws_ok($$ select ops_place_connections('f5130000-0000-4000-8000-000000000001') $$,
  '42501', null, 'nor see a place''s connections');
reset role;

select * from finish();
rollback;
