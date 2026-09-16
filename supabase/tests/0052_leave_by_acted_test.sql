-- pgTAP: 0052 — a leave-by reminder counts as acted on when its item started within twenty
-- minutes of the plan.
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5200000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0052.test'),
  ('f5200000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0052.test');

insert into user_roles (user_id, role) values ('f5200000-0000-4000-8000-0000000000a1', 'editor');

create or replace function t52_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

create or replace function t52_leave_by(p_key text) returns bigint language sql as $$
  select (product_outcomes(30) #>> array['leave_by', p_key])::bigint
$$;
grant execute on function t52_leave_by(text) to authenticated;

select t52_as('f5200000-0000-4000-8000-0000000000a1');
select set_config('t52.sent', t52_leave_by('sent')::text, true);
select set_config('t52.acted', t52_leave_by('acted')::text, true);
reset role;

insert into journeys (id, owner_user_id, title, status, start_date, end_date)
values ('f5210000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-0000000000a2',
        'Leave-by journey', 'active', (now() at time zone 'Asia/Kolkata')::date,
        (now() at time zone 'Asia/Kolkata')::date);

-- One item left for on time, one that started an hour and a half late.
insert into journey_items (id, journey_id, item_type, tier, planned_start_at, actual_start_at, status) values
  ('f5220000-0000-4000-8000-000000000001', 'f5210000-0000-4000-8000-000000000001', 'experience',
   'important', now() - interval '3 hours', now() - interval '3 hours' + interval '9 minutes', 'done'),
  ('f5220000-0000-4000-8000-000000000002', 'f5210000-0000-4000-8000-000000000001', 'experience',
   'important', now() - interval '2 hours', now() - interval '30 minutes', 'done');

insert into notifications (user_id, notification_type, channel, status, sent_at, journey_id, payload) values
  ('f5200000-0000-4000-8000-0000000000a2', 'leave_by', 'push', 'sent', now() - interval '3 hours',
   'f5210000-0000-4000-8000-000000000001',
   '{"params":{"itemId":"f5220000-0000-4000-8000-000000000001"}}'::jsonb),
  ('f5200000-0000-4000-8000-0000000000a2', 'leave_by', 'push', 'sent', now() - interval '2 hours',
   'f5210000-0000-4000-8000-000000000001',
   '{"params":{"itemId":"f5220000-0000-4000-8000-000000000002"}}'::jsonb),
  -- Scheduled but not yet sent: nobody has been reminded, so it counts for nothing.
  ('f5200000-0000-4000-8000-0000000000a2', 'leave_by', 'push', 'scheduled', null,
   'f5210000-0000-4000-8000-000000000001',
   '{"params":{"itemId":"f5220000-0000-4000-8000-000000000001"}}'::jsonb);

select t52_as('f5200000-0000-4000-8000-0000000000a1');
select is(t52_leave_by('sent'), current_setting('t52.sent')::bigint + 2,
  'two reminders were sent');
select is(t52_leave_by('acted'), current_setting('t52.acted')::bigint + 1,
  'and one was acted on: the item that started within twenty minutes of its plan');
select ok((product_outcomes(30) -> 'leave_by') ? 'sent', 'the signal is part of product outcomes');
reset role;

select t52_as('f5200000-0000-4000-8000-0000000000a2');
select throws_ok($$ select product_outcomes(30) $$, '42501', null,
  'and a traveler still cannot read any of it');
reset role;

select * from finish();
rollback;
