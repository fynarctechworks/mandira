-- pgTAP: 0048 — health at departure is captured once and cannot be forged; product outcomes
-- are counts only, for admins, editors and approvers.
begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4800000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0048.test'),
  ('f4800000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0048.test');

insert into user_roles (user_id, role) values ('f4800000-0000-4000-8000-0000000000a1', 'editor');

create or replace function t48_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- The local database holds other runs' journeys, so outcomes are compared as a difference.
create or replace function t48_delta(p_path text[]) returns bigint language sql as $$
  select (product_outcomes(30) #>> p_path)::bigint
       - coalesce((current_setting('t48.before')::jsonb #>> p_path)::bigint, 0)
$$;
grant execute on function t48_delta(text[]) to authenticated;

select t48_as('f4800000-0000-4000-8000-0000000000a1');
select set_config('t48.before', product_outcomes(30)::text, true);
reset role;

-- ── Health at departure ──────────────────────────────────────────────────────

-- Started yesterday, ends tomorrow, in India: two journey-days so far.
insert into journeys (id, owner_user_id, title, status, start_date, end_date, health_state)
values ('f4810000-0000-4000-8000-000000000001', 'f4800000-0000-4000-8000-0000000000a2',
        'Departing', 'upcoming', (now() at time zone 'Asia/Kolkata')::date - 1,
        (now() at time zone 'Asia/Kolkata')::date + 1, 'tight');

insert into journey_items (journey_id, item_type, tier, fixed_start_at) values
  ('f4810000-0000-4000-8000-000000000001', 'experience', 'protected', null),
  ('f4810000-0000-4000-8000-000000000001', 'experience', 'fixed', now());

insert into journeys (id, owner_user_id, title, health_state)
values ('f4810000-0000-4000-8000-000000000002', 'f4800000-0000-4000-8000-0000000000a2',
        'Still a draft', 'comfortable');
insert into journey_items (journey_id, item_type, tier) values
  ('f4810000-0000-4000-8000-000000000002', 'experience', 'important');

select is((select health_at_departure from journeys where id = 'f4810000-0000-4000-8000-000000000001'),
  null, 'an upcoming journey has not departed');

update journeys set status = 'active' where id = 'f4810000-0000-4000-8000-000000000001';
select is((select health_at_departure::text from journeys where id = 'f4810000-0000-4000-8000-000000000001'),
  'tight', 'becoming active records the health it set off with');

update journeys set health_state = 'broken' where id = 'f4810000-0000-4000-8000-000000000001';
select is((select health_at_departure::text from journeys where id = 'f4810000-0000-4000-8000-000000000001'),
  'tight', 'a later recompute does not rewrite it');

update journeys set status = 'upcoming' where id = 'f4810000-0000-4000-8000-000000000001';
update journeys set status = 'active', health_state = 'comfortable'
 where id = 'f4810000-0000-4000-8000-000000000001';
select is((select health_at_departure::text from journeys where id = 'f4810000-0000-4000-8000-000000000001'),
  'tight', 'and neither does becoming active a second time');
update journeys set health_state = 'broken' where id = 'f4810000-0000-4000-8000-000000000001';

select t48_as('f4800000-0000-4000-8000-0000000000a2');
update journeys set health_at_departure = 'comfortable'
 where id = 'f4810000-0000-4000-8000-000000000001';
insert into journeys (id, owner_user_id, title, status, health_at_departure)
values ('f4810000-0000-4000-8000-000000000003', 'f4800000-0000-4000-8000-0000000000a2',
        'Forged', 'draft', 'comfortable');
reset role;

select is((select health_at_departure::text from journeys where id = 'f4810000-0000-4000-8000-000000000001'),
  'tight', 'the owner cannot change it');
select is((select health_at_departure from journeys where id = 'f4810000-0000-4000-8000-000000000003'),
  null, 'or set it on a journey that never departed');
delete from journeys where id = 'f4810000-0000-4000-8000-000000000003';

-- ── What the outcomes count ──────────────────────────────────────────────────

insert into journey_change_events (journey_id, trigger, change_card, chosen_option_index, created_at, decided_at) values
  ('f4810000-0000-4000-8000-000000000001', 'user_late', '{"options":[]}', 0, now(), now() + interval '1 minute'),
  ('f4810000-0000-4000-8000-000000000001', 'user_late', '{"options":[]}', null, now(), now() + interval '5 minutes'),
  ('f4810000-0000-4000-8000-000000000001', 'user_stay_longer', '{"options":[]}', 1, now(), now() + interval '10 minutes'),
  ('f4810000-0000-4000-8000-000000000001', 'knowledge_update', null, null, now(), null);

insert into analytics_events (event_name, journey_id, is_offline) values
  ('live_opened', 'f4810000-0000-4000-8000-000000000001', false),
  ('live_opened', 'f4810000-0000-4000-8000-000000000001', true),
  ('offline_render', 'f4810000-0000-4000-8000-000000000001', true);

insert into user_reports (report_type, entity_table, entity_id, journey_id, status) values
  ('closed', 'places', gen_random_uuid(), 'f4810000-0000-4000-8000-000000000001', 'resolved_updated'),
  ('timing_changed', 'places', gen_random_uuid(), 'f4810000-0000-4000-8000-000000000001', 'new');

select t48_as('f4800000-0000-4000-8000-0000000000a1');

select is(t48_delta('{journeys,created}'), 2::bigint, 'counts the journeys created');
select is(t48_delta('{journeys,with_protected}'), 1::bigint, 'and those with a PROTECTED item');
select is(t48_delta('{journeys,with_protected_and_fixed}'), 1::bigint, 'and with PROTECTED and FIXED');
select is(t48_delta('{health_at_departure,tight}'), 1::bigint, 'health at departure, by state');
select is(t48_delta('{change_cards,shown}'), 3::bigint, 'Change Cards shown, never the evaluations without a card');
select is(t48_delta('{change_cards,accepted}'), 2::bigint, 'accepted');
select is(t48_delta('{change_cards,kept_as_is}'), 1::bigint, 'kept as is');
select is(t48_delta('{change_cards,accepted_within_2_min}'), 1::bigint, 'and accepted within two minutes');
select is(t48_delta('{live,journey_days}'), 2::bigint, 'journey-days so far, not the future ones');
select is(t48_delta('{live,journey_days_with_live}'), 1::bigint, 'a journey-day with Live opened counts once');
select is(t48_delta('{reports,valid}'), 1::bigint, 'reports that led to an update');

select ok(
  product_outcomes(30)::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  'no id leaves the function');

reset role;
select t48_as('f4800000-0000-4000-8000-0000000000a2');
select throws_ok($$ select product_outcomes(30) $$, '42501', null, 'a traveler cannot read outcomes');
reset role;

select * from finish();
rollback;
