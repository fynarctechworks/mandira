-- ══════════════════════════════════════════════════════════════════════════════
-- 0046 · Ops queue-age alerts (TRD §11 Monitoring)
--
-- TRD: "Ops dashboard queue-age alert (email when any queue item > 7 days)". The dashboard
-- has shown each queue's oldest item since 0032, but nobody is told unless they open it —
-- and a report that has waited a fortnight is exactly the one nobody opened the page for.
--
--   * `ops_overdue_queues(p_days)` returns the queues whose oldest item has waited longer
--     than p_days, counted exactly as `knowledge_health()` counts them. Service role only:
--     `knowledge_health()` checks for an Ops user, and the job runs as nobody.
--   * `ops_alert_recipients()` returns the admins' email addresses, service role only.
--   * `send_ops_alerts` is a daily app cron (0037's dispatcher) that calls the web route
--     which emails the admins when anything is overdue, and appears in `v_job_health`.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function ops_overdue_queues(p_days integer default 7)
returns table (queue text, open_count bigint, oldest_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select queues.queue, queues.open_count, queues.oldest_at
  from (
    select 'review'::text as queue, count(*) as open_count, min(created_at) as oldest_at
      from change_candidates where status = 'open'
    union all
    select 'verify', count(*), min(created_at)
      from review_tasks where task_type = 'verify' and status in ('open', 'in_progress')
    union all
    select 'reverify', count(*), min(created_at)
      from review_tasks where task_type = 'reverify' and status in ('open', 'in_progress')
    union all
    select 'conflicts', count(*), min(created_at)
      from conflicts where status in ('open', 'escalated')
    union all
    select 'reports', count(*), min(created_at)
      from user_reports where status in ('new', 'triaged', 'verifying')
    union all
    select 'publish', coalesce(sum(n), 0)::bigint, min(oldest)
      from (
        select count(*) as n, min(updated_at) as oldest from destinations where status = 'in_review'
        union all select count(*), min(updated_at) from places where status = 'in_review'
        union all select count(*), min(updated_at) from experiences where status = 'in_review'
        union all select count(*), min(updated_at) from routes where status = 'in_review'
        union all select count(*), min(updated_at) from transport_connections where status = 'in_review'
        union all select count(*), min(updated_at) from guidance_blocks where status = 'in_review'
        union all select count(*), min(updated_at) from phrases where status = 'in_review'
        union all select count(*), min(updated_at) from advisories where status = 'in_review'
      ) waiting
  ) queues
  where queues.oldest_at < now() - make_interval(days => p_days);
$$;

comment on function ops_overdue_queues(integer) is
  'Queues whose oldest item has waited longer than p_days, counted as knowledge_health() counts them; for the daily Ops alert (0046).';

create or replace function ops_alert_recipients()
returns table (email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct u.email::text
    from user_roles r
    join auth.users u on u.id = r.user_id
   where r.role = 'admin'
     and u.email is not null;
$$;

comment on function ops_alert_recipients() is
  'The admins an Ops alert is emailed to (0046).';

revoke all on function ops_overdue_queues(integer) from public, anon, authenticated;
revoke all on function ops_alert_recipients() from public, anon, authenticated;
grant execute on function ops_overdue_queues(integer) to service_role;
grant execute on function ops_alert_recipients() to service_role;

-- ── The dispatcher learns the new job (0040's function, one case added) ────────────────

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
    when 'purge_report_photos' then '/api/cron/report-photos'
    when 'send_ops_alerts' then '/api/cron/ops-alerts'
  end;
  if v_path is null then
    raise exception 'Unknown app cron: %', p_name;
  end if;

  update job_runs r
  set status = 'failed',
      detail = coalesce(r.detail, '{}'::jsonb)
        || jsonb_build_object('http_status', resp.status_code, 'timed_out', resp.timed_out)
  from net._http_response resp
  where r.job_name = p_name
    and r.status = 'succeeded'
    and r.started_at > now() - interval '2 days'
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

  insert into job_runs (job_name, status, finished_at, detail)
  values (p_name, 'succeeded', now(), jsonb_build_object('request_id', v_request));

  return jsonb_build_object('configured', true, 'request_id', v_request);
end;
$$;

revoke all on function dispatch_app_cron(text) from public, anon, authenticated;

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
  ('refresh_live_feeds', 7200),
  ('purge_report_photos', 86400),
  ('send_ops_alerts', 86400)
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
  if exists (select 1 from cron.job where jobname = 'send_ops_alerts') then
    perform cron.unschedule('send_ops_alerts');
  end if;
  -- 08:30 IST: at the start of an Ops working day, not in the middle of the night.
  perform cron.schedule('send_ops_alerts', '0 3 * * *',
                        $job$select dispatch_app_cron('send_ops_alerts')$job$);
end;
$$;
