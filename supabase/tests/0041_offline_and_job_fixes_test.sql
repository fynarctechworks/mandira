-- 0041 · the roller never undoes "End journey"; dispatched crons are reconciled inside pg_net's TTL
begin;
select plan(16);

-- ══════════════════════════════════════════════════════════════════════════════
-- roll_journey_statuses leaves a completed journey completed
-- ══════════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email) values
  ('e4100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ended-early@roller.test');

insert into journeys (id, owner_user_id, title, status, start_date, end_date, timezone, completed_at)
values
  -- Ended with "End journey" on its second day: inside its dates, so the dates say `active`.
  ('e4500000-0000-4000-8000-000000000001', 'e4100000-0000-4000-8000-000000000001',
   'Ended early', 'completed', (now() at time zone 'Asia/Kolkata')::date - 1,
   (now() at time zone 'Asia/Kolkata')::date + 2, 'Asia/Kolkata', now() - interval '3 hours'),
  -- Completed before it even started: the dates say `upcoming`.
  ('e4500000-0000-4000-8000-000000000002', 'e4100000-0000-4000-8000-000000000001',
   'Called off', 'completed', (now() at time zone 'Asia/Kolkata')::date + 5,
   (now() at time zone 'Asia/Kolkata')::date + 7, 'Asia/Kolkata', now() - interval '1 day'),
  -- An ordinary journey inside its dates still rolls forward as before.
  ('e4500000-0000-4000-8000-000000000003', 'e4100000-0000-4000-8000-000000000001',
   'Under way', 'upcoming', (now() at time zone 'Asia/Kolkata')::date - 1,
   (now() at time zone 'Asia/Kolkata')::date + 2, 'Asia/Kolkata', null),
  -- And one long past its end still completes on its own.
  ('e4500000-0000-4000-8000-000000000004', 'e4100000-0000-4000-8000-000000000001',
   'Long over', 'active', (now() at time zone 'Asia/Kolkata')::date - 12,
   (now() at time zone 'Asia/Kolkata')::date - 6, 'Asia/Kolkata', null);

select lives_ok($$ select roll_journey_statuses() $$, 'the roller runs');

select is(
  (select status::text from journeys where id = 'e4500000-0000-4000-8000-000000000001'),
  'completed',
  'a journey the traveler ended inside its dates stays completed'
);
select is(
  (select status::text from journeys where id = 'e4500000-0000-4000-8000-000000000002'),
  'completed',
  'a journey completed before its start date is not rolled back to upcoming'
);
select ok(
  (select completed_at between now() - interval '3 hours 1 minute' and now() - interval '2 hours 59 minutes'
   from journeys where id = 'e4500000-0000-4000-8000-000000000001'),
  'and when it was completed is left as the traveler set it'
);
select is(
  (select status::text from journeys where id = 'e4500000-0000-4000-8000-000000000003'),
  'active',
  'an ordinary journey inside its dates still becomes active'
);
select is(
  (select status::text from journeys where id = 'e4500000-0000-4000-8000-000000000004'),
  'completed',
  'and one well past its end still completes on schedule'
);

select lives_ok($$ select roll_journey_statuses() $$, 'a second run');
select is(
  (select status::text from journeys where id = 'e4500000-0000-4000-8000-000000000001'),
  'completed',
  'still completed after the next hour'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- reconcile_app_cron_responses
--
-- net._http_response is writable by postgres locally, so real answers are simulated. Request
-- ids are far above anything pg_net's sequence has issued, so no real response can collide.
-- ══════════════════════════════════════════════════════════════════════════════

select has_function('public', 'reconcile_app_cron_responses', 'the reconciler exists');
select is(
  has_function_privilege('anon', 'public.reconcile_app_cron_responses()', 'execute')
    or has_function_privilege('authenticated', 'public.reconcile_app_cron_responses()', 'execute'),
  false,
  'neither a visitor nor a signed-in user can run it'
);

insert into job_runs (id, job_name, status, started_at, finished_at, detail) values
  -- A nightly purge whose route answered 500.
  ('e4600000-0000-4000-8000-000000000001', 'purge_report_photos', 'succeeded',
   now() - interval '10 minutes', now() - interval '10 minutes', '{"request_id": 990000000001}'),
  -- A dispatch that was answered 200.
  ('e4600000-0000-4000-8000-000000000002', 'purge_report_photos', 'succeeded',
   now() - interval '1 day', now() - interval '1 day', '{"request_id": 990000000002}'),
  -- A dispatch whose answer has not arrived yet.
  ('e4600000-0000-4000-8000-000000000003', 'send_notifications', 'succeeded',
   now() - interval '1 minute', now() - interval '1 minute', '{"request_id": 990000000003}'),
  -- A dispatch that timed out.
  ('e4600000-0000-4000-8000-000000000004', 'refresh_live_feeds', 'succeeded',
   now() - interval '2 hours', now() - interval '2 hours', '{"request_id": 990000000004}'),
  -- Older than the window: left alone even though its answer was a 500.
  ('e4600000-0000-4000-8000-000000000005', 'purge_report_photos', 'succeeded',
   now() - interval '3 days', now() - interval '3 days', '{"request_id": 990000000005}'),
  -- A job summary that merely carries a non-numeric request_id must not break the cast.
  ('e4600000-0000-4000-8000-000000000006', 'roll_journey_statuses', 'succeeded',
   now() - interval '5 minutes', now() - interval '5 minutes', '{"request_id": "not-a-number"}');

insert into net._http_response (id, status_code, timed_out, created) values
  (990000000001, 500, false, now() - interval '9 minutes'),
  (990000000002, 200, false, now() - interval '1 day'),
  (990000000004, null, true, now() - interval '2 hours'),
  (990000000005, 500, false, now() - interval '3 days');

select ok(
  (reconcile_app_cron_responses() ->> 'runs_marked_failed')::int >= 2,
  'the reconciler marks runs'
);

select is(
  (select status from job_runs where id = 'e4600000-0000-4000-8000-000000000001'),
  'failed',
  'a daily dispatch answered 500 is recorded as failed'
);
select is(
  (select (detail ->> 'http_status')::int from job_runs where id = 'e4600000-0000-4000-8000-000000000001'),
  500,
  'with the status the route answered'
);
select is(
  (select status from job_runs where id = 'e4600000-0000-4000-8000-000000000004'),
  'failed',
  'a timed-out dispatch is recorded as failed'
);
select set_eq(
  $$ select status from job_runs
     where id in ('e4600000-0000-4000-8000-000000000002', 'e4600000-0000-4000-8000-000000000003',
                  'e4600000-0000-4000-8000-000000000005', 'e4600000-0000-4000-8000-000000000006') $$,
  $$ values ('succeeded') $$,
  'answered 200, not answered yet, outside the window, or not a dispatch: all left succeeded'
);
select ok(
  exists (select 1 from cron.job
          where jobname = 'reconcile_app_cron_responses' and schedule = '*/5 * * * *'),
  'the reconciler runs every five minutes, inside pg_net''s six-hour TTL'
);

select * from finish();
rollback;
