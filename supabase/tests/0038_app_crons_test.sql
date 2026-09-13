-- 0037 · app crons dispatched from the database (D-173)
begin;
select plan(9);

select has_function('public', 'dispatch_app_cron', array['text'], 'the dispatcher exists');

select is(
  has_function_privilege('anon', 'public.dispatch_app_cron(text)', 'execute'),
  false,
  'a visitor cannot make the app send notifications'
);
select is(
  has_function_privilege('authenticated', 'public.dispatch_app_cron(text)', 'execute'),
  false,
  'nor can a signed-in traveler or operator'
);

select throws_ok(
  $$ select dispatch_app_cron('drop_everything') $$,
  'P0001',
  'Unknown app cron: drop_everything',
  'only the two named jobs can be dispatched'
);

-- The test database holds no Vault secrets, which is the unconfigured production state.
delete from vault.secrets where name in ('mandhira_web_url', 'mandhira_cron_secret');

select is(
  (dispatch_app_cron('send_notifications') ->> 'configured')::boolean,
  false,
  'without the app URL and secret, nothing is sent'
);
select is(
  (select status from job_runs where job_name = 'send_notifications'
   order by started_at desc limit 1),
  'failed',
  'and the run records that it did not happen'
);
select ok(
  (select needs_attention from v_job_health where job_name = 'send_notifications'),
  'so the Ops job panel shows it needs attention'
);

select ok(
  exists (select 1 from cron.job
          where jobname = 'send_notifications' and schedule = '*/10 * * * *'),
  'notifications are dispatched every ten minutes'
);
select ok(
  exists (select 1 from cron.job
          where jobname = 'refresh_live_feeds' and schedule = '15 */2 * * *'),
  'live feeds every two hours'
);

select * from finish();
rollback;
