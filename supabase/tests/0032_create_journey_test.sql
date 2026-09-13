-- pgTAP: create_journey (0031) — whole or nothing, and only ever for the signed-in traveler.

begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3200000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'planner@0032.test'),
  ('f3200000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'someone-else@0032.test');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('f3210000-0000-4000-8000-000000000001', 'journey-rpc-town', '{"en":"Town"}'::jsonb,
        'SRID=4326;POINT(80.0 15.0)', 5, 'published');

create or replace function t32_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

select t32_as('f3200000-0000-4000-8000-0000000000a1');

select lives_ok(
  $$ select create_journey($j${
       "owner_user_id": "f3200000-0000-4000-8000-0000000000a2",
       "start_date": "2026-11-01", "end_date": "2026-11-02", "pace": "relaxed",
       "destination_ids": ["f3210000-0000-4000-8000-000000000001"],
       "travelers": [{"label": "Amma", "mobility": "limited_walking", "age_band": "senior", "is_self": false}],
       "items": [
         {"day_index": 0, "sort_order": 0, "item_type": "experience", "tier": "protected", "duration_likely_minutes": 60},
         {"day_index": 1, "sort_order": 0, "item_type": "fixed_commitment", "tier": "fixed",
          "fixed_start_at": "2026-11-02T18:00:00+05:30", "buffer_minutes": 30}
       ]
     }$j$::jsonb) $$,
  'a complete journey saves');

reset role;

select is(
  (select count(*)::int from journeys where owner_user_id = 'f3200000-0000-4000-8000-0000000000a1'),
  1, 'it belongs to the signed-in traveler');
select is(
  (select count(*)::int from journeys where owner_user_id = 'f3200000-0000-4000-8000-0000000000a2'),
  0, 'never to an owner named in the payload');
select is(
  (select count(*)::int from journey_items i join journeys j on j.id = i.journey_id
    where j.owner_user_id = 'f3200000-0000-4000-8000-0000000000a1'),
  2, 'with both of its items');
select is(
  (select count(*)::int from journey_travelers jt join journeys j on j.id = jt.journey_id
    where j.owner_user_id = 'f3200000-0000-4000-8000-0000000000a1'),
  1, 'its traveler, linked');
select is(
  (select buffer_minutes from journey_items i join journeys j on j.id = i.journey_id
    where j.owner_user_id = 'f3200000-0000-4000-8000-0000000000a1' and i.tier = 'fixed'),
  30, 'and the buffer the traveler set, not the default');

select t32_as('f3200000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$ select create_journey($j${
       "start_date": "2026-12-01",
       "destination_ids": ["f3210000-0000-4000-8000-000000000001"],
       "travelers": [{"mobility": "full", "age_band": "adult"}],
       "items": [
         {"day_index": 0, "sort_order": 0, "item_type": "experience", "tier": "important"},
         {"day_index": 0, "sort_order": 1, "item_type": "fixed_commitment", "tier": "fixed"}
       ]
     }$j$::jsonb) $$,
  '23514', null,
  'an item the schema refuses (FIXED with no time) fails the whole call');

reset role;

select is(
  (select count(*)::int from journeys
    where owner_user_id = 'f3200000-0000-4000-8000-0000000000a1' and start_date = '2026-12-01'),
  0, 'and leaves no half-saved journey behind');

select * from finish();
rollback;
