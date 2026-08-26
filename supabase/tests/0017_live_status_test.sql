-- pgTAP: what happened on the day belongs to the traveler it happened to
-- (B-022, PRD-LIVE-002, PRD-PRIV-002).
--
-- `status` and the `actual_*` timestamps are a record of where someone physically was and
-- when. That is at least as sensitive as the plan itself — a plan is an intention, this is
-- a movement history — so the isolation assertions matter more here, not less.

begin;
select plan(7);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'walker@live.test'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@live.test');

insert into journeys (id, owner_user_id, title, start_date, end_date, timezone)
values ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
        'A day being walked', '2026-10-12', '2026-10-12', 'Asia/Kolkata');

insert into journey_items (id, journey_id, day_index, sort_order, item_type, tier)
values ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
        0, 0, 'experience', 'protected');

-- ── The default is "planned", never something that looks like progress ──────
select is(
  (select status from journey_items where id = 'c3000000-0000-4000-8000-000000000001'),
  'planned',
  'a new item starts planned, so nothing is done until someone says it is'
);

select is(
  (select actual_start_at from journey_items where id = 'c3000000-0000-4000-8000-000000000001'),
  null,
  'and carries no actual times until something actually happens'
);

-- ── The owner ───────────────────────────────────────────────────────────────
select test_become('c1000000-0000-4000-8000-000000000001');

update journey_items
   set status = 'done', actual_start_at = now(), actual_end_at = now()
 where id = 'c3000000-0000-4000-8000-000000000001';

select is(
  (select status from journey_items where id = 'c3000000-0000-4000-8000-000000000001'),
  'done',
  'the traveler can record that they did it'
);

-- The status column is a CHECK, not an enum, so the constraint is worth pinning: a typo in
-- a route would otherwise write a status nothing else in the system recognises.
select throws_ok(
  $$ update journey_items set status = 'finished'
      where id = 'c3000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'and cannot invent a status the rest of the system does not know'
);

-- ── The stranger ────────────────────────────────────────────────────────────
select test_become('c1000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from journey_items
      where journey_id = 'c2000000-0000-4000-8000-000000000001' $$,
  'a stranger cannot see where someone else has been'
);

-- An UPDATE filtered away by RLS reports success and changes nothing, so the assertion has
-- to be on the ROW rather than on the statement.
update journey_items
   set status = 'skipped', actual_end_at = null
 where journey_id = 'c2000000-0000-4000-8000-000000000001';

select test_become('c1000000-0000-4000-8000-000000000001');

select is(
  (select status from journey_items where id = 'c3000000-0000-4000-8000-000000000001'),
  'done',
  'and cannot rewrite what happened on someone else''s day'
);

select isnt(
  (select actual_end_at from journey_items where id = 'c3000000-0000-4000-8000-000000000001'),
  null,
  'nor erase the record of it'
);

select * from finish();
rollback;
