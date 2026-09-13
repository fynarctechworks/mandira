-- pgTAP: 0033 — export, deletion and reordering, each only ever for the signed-in traveler.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3400000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@0034.test'),
  ('f3400000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@0034.test');

insert into journeys (id, owner_user_id, start_date) values
  ('f3410000-0000-4000-8000-000000000001', 'f3400000-0000-4000-8000-0000000000b1', '2026-11-01'),
  ('f3410000-0000-4000-8000-000000000002', 'f3400000-0000-4000-8000-0000000000b2', '2026-11-01');

insert into journey_items (id, journey_id, day_index, sort_order, item_type, tier) values
  ('f3420000-0000-4000-8000-000000000001', 'f3410000-0000-4000-8000-000000000001', 0, 0, 'experience', 'important'),
  ('f3420000-0000-4000-8000-000000000002', 'f3410000-0000-4000-8000-000000000001', 0, 1, 'experience', 'optional'),
  ('f3420000-0000-4000-8000-000000000003', 'f3410000-0000-4000-8000-000000000001', 0, 2, 'rest', 'optional');

insert into notification_subscriptions (user_id, endpoint, keys)
values ('f3400000-0000-4000-8000-0000000000b1', 'https://push.example.invalid/0034',
        '{"p256dh":"secret-key-material","auth":"secret"}'::jsonb);

create or replace function t34_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

select ok(
  not has_function_privilege('anon', 'public.export_my_data()', 'execute')
    and not has_function_privilege('anon', 'public.request_account_deletion()', 'execute'),
  'a signed-out visitor can reach none of these');

-- ── Export ────────────────────────────────────────────────────────────────────

select t34_as('f3400000-0000-4000-8000-0000000000b1');

select is(
  (select jsonb_array_length(export_my_data() -> 'journeys')), 1,
  'the export holds my journey');
select is(
  (select jsonb_array_length(export_my_data() -> 'journeys' -> 0 -> 'items')), 3,
  'with its items');
select ok(
  (select (export_my_data() -> 'journeys')::text not like '%f3410000-0000-4000-8000-000000000002%'),
  'and nothing of anyone else''s');
select is(
  (select export_my_data() -> 'account' ->> 'email'), 'owner@0034.test',
  'it names the account it belongs to');
select ok(
  (select (export_my_data() -> 'push_subscriptions')::text not like '%secret%'),
  'push subscription keys are credentials, and are left out');

-- ── Reordering ────────────────────────────────────────────────────────────────

select lives_ok(
  $$ select reorder_journey_items('f3410000-0000-4000-8000-000000000001', 0, array[
       'f3420000-0000-4000-8000-000000000003', 'f3420000-0000-4000-8000-000000000001',
       'f3420000-0000-4000-8000-000000000002']::uuid[]) $$,
  'a complete new order applies');
select is(
  (select sort_order from journey_items where id = 'f3420000-0000-4000-8000-000000000003'), 0,
  'and the item moved to the front is first');
select throws_ok(
  $$ select reorder_journey_items('f3410000-0000-4000-8000-000000000001', 0, array[
       'f3420000-0000-4000-8000-000000000001', 'f3420000-0000-4000-8000-000000000001',
       'f3420000-0000-4000-8000-000000000002']::uuid[]) $$,
  '22023', null,
  'an order naming one item twice and leaving another out is refused');

reset role;
select t34_as('f3400000-0000-4000-8000-0000000000b2');
select throws_ok(
  $$ select reorder_journey_items('f3410000-0000-4000-8000-000000000001', 0, array[
       'f3420000-0000-4000-8000-000000000001', 'f3420000-0000-4000-8000-000000000002',
       'f3420000-0000-4000-8000-000000000003']::uuid[]) $$,
  '22023', null,
  'another traveler cannot reorder my day');

-- ── Deletion ──────────────────────────────────────────────────────────────────

reset role;
select t34_as('f3400000-0000-4000-8000-0000000000b1');

select ok(
  (select request_account_deletion() between now() + interval '29 days' and now() + interval '31 days'),
  'requesting deletion answers with the date it will happen');

reset role;
select isnt(
  (select deleted_at from profiles where id = 'f3400000-0000-4000-8000-0000000000b1'), null,
  'and marks the account for the purge job');

select t34_as('f3400000-0000-4000-8000-0000000000b1');
select cancel_account_deletion();
reset role;
select is(
  (select deleted_at from profiles where id = 'f3400000-0000-4000-8000-0000000000b1'), null,
  'cancelling keeps the account');

select * from finish();
rollback;
