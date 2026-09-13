-- ══════════════════════════════════════════════════════════════════════════════
-- 0041 · Two scheduled-job fixes found in the audit
--
--   1. `roll_journey_statuses` (0013) recomputed every journey's status from its dates, so a
--      journey the traveler ENDED with "End journey" while still inside its dates was moved
--      back to `active` by the next hourly run. Ending a journey is the traveler's explicit
--      tap (PRD Principle 6, TRD §5 `POST /api/journeys/:id/complete`); nothing scheduled may
--      undo it. The function is redefined with `completed` excluded exactly as `archived`
--      already was. Everything else is unchanged.
--
--   2. `dispatch_app_cron` (0037, 0040) checks the answer to the PREVIOUS dispatch in
--      `net._http_response`. pg_net keeps responses for `pg_net.ttl` (6 hours), so a job that
--      runs once a day — `purge_report_photos` — never has its previous answer still there,
--      and a route that answered 500 every night stayed "succeeded" forever. A reconciler
--      now runs every five minutes, well inside the TTL, and marks any dispatched run whose
--      answer was not 2xx as failed. The dispatcher's own check stays: for the ten-minute
--      job it is simply the first to notice. pg_net settings are not changed.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. The roller never moves a completed or archived journey ───────────────────────────

create or replace function roll_journey_statuses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rolled int;
begin
  with target as (
    select
      j.id,
      j.status as current_status,
      case
        -- "end_date passed + 24 h" (TRD §5.4): the end date ends at its own local
        -- midnight, and a full day after that is when the journey is done. The grace
        -- exists so a traveler still has the evening and the next morning to look back
        -- at where they were.
        when j.end_date is not null
             and (now() at time zone j.timezone) >= (j.end_date + interval '2 days')
          then 'completed'
        when j.start_date is not null
             and (now() at time zone j.timezone)::date >= j.start_date
          then 'active'
        when j.start_date is not null
          then 'upcoming'
        else j.status
      end::journey_status_enum as next_status
    from journeys j
    where j.deleted_at is null
      -- `archived` is the traveler's own decision to put a journey away, and `completed`
      -- is either their "End journey" tap or this job having already finished it. Both
      -- are terminal for a schedule: nothing scheduled may take a journey back out of them.
      and j.status not in ('archived', 'completed')
  )
  update journeys j
  set status = target.next_status,
      completed_at = case
        when target.next_status = 'completed' then coalesce(j.completed_at, now())
        else j.completed_at
      end
  from target
  where target.id = j.id
    and target.next_status is distinct from target.current_status;

  get diagnostics v_rolled = row_count;

  return jsonb_build_object('journeys_rolled', v_rolled);
end;
$$;

comment on function roll_journey_statuses() is
  'TRD §5.4 hourly job. Rolls draft/upcoming/active/completed in the journey''s own timezone; never moves a completed or archived journey (0041).';

-- ── 2. Reconciling dispatched app crons against pg_net's answers ────────────────────────

create or replace function reconcile_app_cron_responses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marked int;
begin
  /*
   * A dispatched run is recorded `succeeded` with the pg_net request id (0037). Its answer
   * lands in net._http_response asynchronously and is kept for pg_net.ttl. Any answer that
   * is not 2xx, or a timeout, marks the run failed — the same test the dispatcher applies.
   *
   * The request id is read defensively: only a purely numeric value is cast, inside a CASE
   * so the cast cannot run on a row the filter would have excluded.
   */
  update job_runs r
  set status = 'failed',
      detail = coalesce(r.detail, '{}'::jsonb)
        || jsonb_build_object('http_status', resp.status_code, 'timed_out', resp.timed_out)
  from net._http_response resp
  where r.status = 'succeeded'
    and r.started_at > now() - interval '2 days'
    and (r.detail ->> 'request_id') is not null
    and case
          when (r.detail ->> 'request_id') ~ '^[0-9]{1,18}$'
            then (r.detail ->> 'request_id')::bigint
        end = resp.id
    and (resp.timed_out or resp.status_code is null or resp.status_code >= 300);

  get diagnostics v_marked = row_count;

  return jsonb_build_object('runs_marked_failed', v_marked);
end;
$$;

comment on function reconcile_app_cron_responses() is
  'Every 5 minutes: marks dispatched app-cron runs failed when pg_net recorded a non-2xx answer or a timeout, before pg_net.ttl forgets it (0041).';

revoke all on function reconcile_app_cron_responses() from public, anon, authenticated;
grant execute on function reconcile_app_cron_responses() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reconcile_app_cron_responses') then
    perform cron.unschedule('reconcile_app_cron_responses');
  end if;
  perform cron.schedule('reconcile_app_cron_responses', '*/5 * * * *',
                        $job$select reconcile_app_cron_responses()$job$);
end;
$$;
