-- ══════════════════════════════════════════════════════════════════════════════
-- 0037 · The frequent app jobs are triggered from the database (D-173)
--
-- Sending notifications (every 10 minutes) and refreshing live feeds (every 2 hours) are Next
-- route handlers, because web-push is a Node library (D-072). Vercel Hobby runs cron jobs at
-- most once a day, so a deployment on Hobby with those schedules in vercel.json is refused —
-- or, on a plan that allows it, fires the routes while nothing records whether they ran.
--
-- pg_cron already runs every other job and `v_job_health` already watches them, so these two
-- join them: pg_cron calls the routes through pg_net with the cron secret, and every dispatch
-- leaves a `job_runs` row. The app URL and secret live in Supabase Vault, never in a migration.
--
-- Production setup (RUNBOOK): run once, as a superuser, with the real values:
--   select vault.create_secret('https://app.example', 'mandhira_web_url');
--   select vault.create_secret('<the CRON_SECRET value>', 'mandhira_cron_secret');
-- Until both exist every dispatch is recorded as `failed` / `not_configured`, which is exactly
-- what the Ops dashboard's job panel shows.
-- ══════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_net;

create or replace function dispatch_app_cron(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path    text;
  v_base    text;
  v_secret  text;
  v_request bigint;
begin
  v_path := case p_name
    when 'send_notifications' then '/api/cron/notifications'
    when 'refresh_live_feeds' then '/api/cron/feeds'
  end;
  if v_path is null then
    raise exception 'Unknown app cron: %', p_name;
  end if;

  /*
   * The answer to the previous dispatch arrives asynchronously in net._http_response. A route
   * that answered 401 or 500, or timed out, marks that earlier run failed, so a wrong secret
   * or a broken deploy reaches the dashboard within one interval instead of never.
   */
  update job_runs r
  set status = 'failed',
      detail = coalesce(r.detail, '{}'::jsonb)
        || jsonb_build_object('http_status', resp.status_code, 'timed_out', resp.timed_out)
  from net._http_response resp
  where r.job_name = p_name
    and r.status = 'succeeded'
    and r.started_at > now() - interval '1 day'
    and (r.detail ->> 'request_id') is not null
    and (r.detail ->> 'request_id')::bigint = resp.id
    and (resp.timed_out or resp.status_code is null or resp.status_code >= 300);

  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'mandhira_web_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'mandhira_cron_secret';

  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    insert into job_runs (job_name, status, finished_at, detail)
    values (p_name, 'failed', now(), jsonb_build_object('reason', 'not_configured'));
    return jsonb_build_object('configured', false);
  end if;

  select net.http_get(
    url := rtrim(v_base, '/') || v_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  ) into v_request;

  -- "succeeded" means dispatched; the next dispatch corrects it if the route did not answer 2xx.
  insert into job_runs (job_name, status, finished_at, detail)
  values (p_name, 'succeeded', now(), jsonb_build_object('request_id', v_request));

  return jsonb_build_object('configured', true, 'request_id', v_request);
end;
$$;

comment on function dispatch_app_cron(text) is
  'Calls a Next cron route through pg_net with the Vault-held secret and records a job_runs row (D-173).';

-- Only pg_cron (as the owner) runs this. No client role may make the app send notifications.
revoke all on function dispatch_app_cron(text) from public, anon, authenticated;

-- The dashboard watches the two new jobs like every other one. Same columns, two more rows.
create or replace view v_job_health as
select
  expected.job_name,
  expected.interval_seconds,
  last.started_at as last_run_at,
  last.status as last_status,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    as missed_two_windows,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    or last.status <> 'succeeded'
    as needs_attention
from (values
  ('recompute_freshness', 86400),
  ('roll_journey_statuses', 3600),
  ('purge_deleted_accounts', 86400),
  ('prune_ai_cache', 86400),
  ('prune_rate_limits', 86400),
  ('publish_scheduled_entities', 300),
  ('send_notifications', 600),
  ('refresh_live_feeds', 7200)
) as expected(job_name, interval_seconds)
left join lateral (
  select r.started_at, r.status
  from job_runs r
  where r.job_name = expected.job_name and r.status <> 'skipped'
  order by r.started_at desc
  limit 1
) as last on true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send_notifications') then
    perform cron.unschedule('send_notifications');
  end if;
  perform cron.schedule('send_notifications', '*/10 * * * *',
                        $job$select dispatch_app_cron('send_notifications')$job$);

  if exists (select 1 from cron.job where jobname = 'refresh_live_feeds') then
    perform cron.unschedule('refresh_live_feeds');
  end if;
  perform cron.schedule('refresh_live_feeds', '15 */2 * * *',
                        $job$select dispatch_app_cron('refresh_live_feeds')$job$);
end;
$$;
