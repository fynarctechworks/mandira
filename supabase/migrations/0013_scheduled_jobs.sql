-- 0013_scheduled_jobs.sql — TRD §5.4, the pg_cron half.
--
-- Four jobs that need no content, no network and no Edge Function runtime, so they were
-- buildable while B-013 waits on OPEN-001. The Edge Function jobs (`ingest_sources`,
-- `refresh_live_feeds`, `schedule_notifications`, `send_notifications`) arrive with the
-- features that need them.
--
-- Every job is a SECURITY DEFINER function that returns a summary of what it did, and the
-- schedule is a separate line at the bottom. That split is deliberate: a job you can call
-- by hand is a job you can test, and pgTAP calls each of these directly rather than
-- waiting for a clock.

-- ══════════════════════════════════════════════════════════════════════════════
-- critical_fields — the §4.4 lists, as data.
--
-- `0007_published_views.sql` writes these arrays inline inside each view, which is right
-- for the gate itself: a view that reaches for a function to decide what it gates on is
-- harder to reason about, and the gate is the thing that must never quietly change.
-- Everything ELSE that needs the list — the reverify job below, Ops tooling — reads it
-- from here, and `0011_scheduled_jobs_test` asserts the two agree by parsing the view
-- definitions, so drift fails a test rather than silently un-gating a field.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function critical_fields(p_entity_table text)
returns text[]
language sql
immutable
parallel safe
as $$
  select case p_entity_table
    when 'places' then
      array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
    when 'experiences' then
      array['advance_booking_required', 'advance_booking_how_i18n']
    when 'transport_connections' then array['duration_likely_minutes']
    -- Availability rules are critical in their entirety, so their trust record carries a
    -- NULL field_name. An empty array, not a NULL: "no named fields" and "unknown table"
    -- are different answers and a caller must be able to tell them apart.
    when 'availability_rules' then array[]::text[]
    else null
  end;
$$;

comment on function critical_fields(text) is
  'The TRD §4.4 critical-field list for a table. Kept in step with 0007 by pgTAP.';

-- ══════════════════════════════════════════════════════════════════════════════
-- recompute_freshness — pg_cron, daily 02:00 IST.
--
-- Freshness is a function of the CLOCK, not of any write. A record verified 89 days ago is
-- fresh; the same record tomorrow is aging, and nothing will have touched it. Without this
-- job every badge in the product would be as accurate as the last time somebody happened
-- to edit the row.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function recompute_freshness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_downgraded int;
  v_rederived  int;
  v_tasks      int;
begin
  /*
   * 1. Report-driven downgrade (PRD F14): three INDEPENDENT reports on the same field
   *    within 14 days.
   *
   * Distinct reporters, not distinct reports — one person filing three times is one
   * person disagreeing, and treating it as three would let a single traveler flip a badge.
   * Reports Ops has already resolved as correct are excluded: once an operator has
   * checked the source and confirmed the field, leaving those to keep the badge down
   * would make the resolution meaningless.
   *
   * Computed as a boolean rather than flipped on, so the downgrade LIFTS when the reports
   * age out. A flag that only ever goes one way becomes permanent noise.
   */
  with recent as (
    select
      r.entity_table,
      r.entity_id,
      r.field_name,
      count(distinct coalesce(r.reporter_hash, r.id::text)) as reporters
    from user_reports r
    where r.created_at >= now() - interval '14 days'
      and r.status not in ('resolved_confirmed_correct', 'closed')
    group by r.entity_table, r.entity_id, r.field_name
  )
  update trust_records t
  set report_downgrade = should.value
  from (
    select
      t2.id,
      coalesce((select recent.reporters >= 3
                from recent
                where recent.entity_table = t2.entity_table
                  and recent.entity_id = t2.entity_id
                  and recent.field_name is not distinct from t2.field_name), false) as value
    from trust_records t2
  ) as should
  where should.id = t.id
    and t.report_downgrade is distinct from should.value;

  get diagnostics v_downgraded = row_count;

  /*
   * 2. Re-derive freshness and confidence wherever the passage of time has changed them.
   *
   * The write is a no-op assignment: `apply_trust_derivations` (0002) recomputes both on
   * every update, so touching the row is enough. Only rows whose derived value would
   * actually change are touched — a daily UPDATE over every trust record would churn the
   * table and rewrite `updated_at` on rows nothing happened to, which is exactly the
   * signal Ops uses to see what moved.
   */
  update trust_records t
  set updated_at = updated_at
  where t.freshness is distinct from derive_freshness(t.verified_at, t.valid_until)
     or t.confidence is distinct from derive_confidence(
          t.source_tier, t.verification_status,
          derive_freshness(t.verified_at, t.valid_until),
          t.conflict_flag, t.report_downgrade
        );

  get diagnostics v_rederived = row_count;

  /*
   * 3. A reverify task for every stale CRITICAL field on something a traveler can see.
   *
   * Only published entities: a stale field on a draft is not yet anybody's problem, and
   * filling the queue with them buries the ones that are. One open task per field at a
   * time — a queue that grows a duplicate every night stops being read.
   */
  insert into review_tasks (task_type, entity_table, entity_id, field_name, priority, notes)
  select
    'reverify',
    t.entity_table,
    t.entity_id,
    t.field_name,
    1,
    'Critical field is stale. Confirm against the source or record a new one.'
  from trust_records t
  where t.freshness = 'stale'
    and (
      t.field_name = any (coalesce(critical_fields(t.entity_table), array[]::text[]))
      or (t.field_name is null and t.entity_table = 'availability_rules')
    )
    and is_entity_published(t.entity_table, t.entity_id)
    and not exists (
      select 1 from review_tasks existing
      where existing.task_type = 'reverify'
        and existing.entity_table = t.entity_table
        and existing.entity_id = t.entity_id
        and existing.field_name is not distinct from t.field_name
        and existing.status in ('open', 'in_progress')
    );

  get diagnostics v_tasks = row_count;

  return jsonb_build_object(
    'report_downgrades_changed', v_downgraded,
    'trust_records_rederived', v_rederived,
    'reverify_tasks_created', v_tasks
  );
end;
$$;

comment on function recompute_freshness() is
  'TRD §5.4 daily job: report downgrades, freshness/confidence re-derivation, reverify tasks.';

/*
 * Whether a traveler can currently see this entity.
 *
 * Dynamic SQL over a table name is normally a smell, but the alternative here is a
 * four-branch CASE that has to be edited every time a knowledge table is added — and the
 * one that gets forgotten fails silently by never raising a task. The name is checked
 * against the actual table list first, so nothing arbitrary is ever executed.
 */
create or replace function is_entity_published(p_entity_table text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean;
begin
  -- Availability rules inherit publication from their experience; they have no status.
  if p_entity_table = 'availability_rules' then
    execute
      'select exists (select 1 from availability_rules a
                        join experiences e on e.id = a.experience_id
                       where a.id = $1 and e.status = ''published'' and e.deleted_at is null)'
      into v_result using p_entity_id;
    return v_result;
  end if;

  if p_entity_table not in ('destinations', 'places', 'experiences', 'routes',
                            'transport_connections', 'guidance_blocks') then
    return false;
  end if;

  -- transport_connections has no soft-delete column, so the clause is added only where
  -- one exists rather than assuming every knowledge table looks the same.
  execute format(
    'select exists (select 1 from %I where id = $1 and status = ''published''%s)',
    p_entity_table,
    case when p_entity_table = 'transport_connections' then '' else ' and deleted_at is null' end
  ) into v_result using p_entity_id;

  return v_result;
end;
$$;

comment on function is_entity_published(text, uuid) is
  'True when the entity is currently visible to travelers. Table name is allowlisted.';

-- ══════════════════════════════════════════════════════════════════════════════
-- journey_status_roller — pg_cron, hourly.
--
-- Statuses roll on the JOURNEY's own timezone, not the server's. A journey in Tirumala
-- becomes active when it is tomorrow there, not when it is tomorrow in UTC — the
-- difference is five and a half hours, which is most of a morning.
-- ══════════════════════════════════════════════════════════════════════════════

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
      -- `archived` is the traveler's own decision to put a journey away. Nothing
      -- scheduled may take it back out.
      and j.status <> 'archived'
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
  'TRD §5.4 hourly job. Rolls draft/upcoming/active/completed in the journey''s own timezone.';

-- ══════════════════════════════════════════════════════════════════════════════
-- purge_deleted_accounts — pg_cron, daily.
--
-- A deletion request is honoured after a grace period (TRD §5.4: 30 days), because the
-- most common reason someone deletes an account is a bad afternoon. After that it is a
-- HARD delete: the row goes, and `on delete cascade` takes the journeys, travelers,
-- reports and subscriptions with it. That is what DPDP erasure means, and a soft flag
-- that never becomes a real delete is not erasure.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function purge_deleted_accounts(p_grace interval default interval '30 days')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purged int;
begin
  with expired as (
    select p.id from profiles p
    where p.deleted_at is not null
      and p.deleted_at <= now() - p_grace
  )
  delete from auth.users u using expired where u.id = expired.id;

  get diagnostics v_purged = row_count;

  return jsonb_build_object('accounts_purged', v_purged);
end;
$$;

comment on function purge_deleted_accounts(interval) is
  'TRD §5.4 daily job. Hard-deletes accounts past their deletion grace period (DPDP).';

-- ══════════════════════════════════════════════════════════════════════════════
-- job_runs and run_scheduled_job — the jobs contract (BACKEND_ARCHITECTURE).
--
-- Every job must be idempotent, single-flight, and leave a record of having run. The
-- three functions above are each idempotent on their own; the other two properties are
-- given to all of them here rather than repeated in each, because a job that forgets one
-- of them fails silently and the whole point of this table is to make silence visible.
-- ══════════════════════════════════════════════════════════════════════════════

create table job_runs (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
                check (status in ('running', 'succeeded', 'failed', 'skipped')),
  -- The job's own summary on success, or a short error on failure. Never a stack trace:
  -- this table is read to answer "did the work happen", not to debug Postgres.
  detail      jsonb
);

comment on table job_runs is
  'One row per scheduled-job execution (BACKEND_ARCHITECTURE jobs contract).';
comment on column job_runs.status is
  'A ''skipped'' run is one that found another already holding the lock — expected, not an error.';

create index job_runs_recent_idx on job_runs (job_name, started_at desc);

alter table job_runs enable row level security;

/*
 * Run one named job, once.
 *
 * Single-flight via an advisory lock keyed on the job name: an hourly job that occasionally
 * takes over an hour would otherwise overlap itself, and two copies of
 * `purge_deleted_accounts` racing is not a thing to find out about later. A run that cannot
 * take the lock records itself as `skipped` rather than as an error — that is the system
 * working, and burying it in a failure count would train everyone to ignore the count.
 *
 * A failing job records the failure and RETURNS it rather than re-raising.
 *
 * That is deliberate and it is a real trade. pg_cron runs each command in its own
 * transaction, so re-raising would roll the whole thing back — including the job_runs row
 * saying it failed. The choice is between an error in the Postgres log with no row here,
 * or a row here and nothing in the Postgres log. This table is what `v_job_health` and the
 * Ops dashboard read, so the row is worth more; `last_status` is how a failure surfaces.
 */
create or replace function run_scheduled_job(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_detail jsonb;
begin
  if p_name not in ('recompute_freshness', 'roll_journey_statuses',
                    'purge_deleted_accounts', 'prune_ai_cache', 'prune_rate_limits') then
    raise exception 'Unknown job: %', p_name;
  end if;

  if not pg_try_advisory_lock(hashtext('mandhira_job:' || p_name)) then
    insert into job_runs (job_name, status, finished_at, detail)
    values (p_name, 'skipped', now(), jsonb_build_object('reason', 'already_running'));
    return jsonb_build_object('skipped', true);
  end if;

  insert into job_runs (job_name) values (p_name) returning id into v_run_id;

  begin
    case p_name
      when 'recompute_freshness'   then v_detail := recompute_freshness();
      when 'roll_journey_statuses' then v_detail := roll_journey_statuses();
      when 'purge_deleted_accounts' then v_detail := purge_deleted_accounts();
      when 'prune_ai_cache'        then v_detail := jsonb_build_object('deleted', prune_ai_cache());
      when 'prune_rate_limits'     then v_detail := jsonb_build_object('deleted', prune_rate_limits());
    end case;
  exception when others then
    -- SQLSTATE, never SQLERRM: an error message can quote row values back, and this table
    -- is read from the Ops dashboard by people who have no business seeing them.
    update job_runs
    set status = 'failed', finished_at = now(),
        detail = jsonb_build_object('error', sqlstate)
    where id = v_run_id;

    perform pg_advisory_unlock(hashtext('mandhira_job:' || p_name));
    return jsonb_build_object('failed', true, 'error', sqlstate);
  end;

  update job_runs
  set status = 'succeeded', finished_at = now(), detail = v_detail
  where id = v_run_id;

  perform pg_advisory_unlock(hashtext('mandhira_job:' || p_name));

  return v_detail;
end;
$$;

comment on function run_scheduled_job(text) is
  'Single-flight wrapper that logs to job_runs. The only thing cron should call.';

/*
 * Job health, for the "missed two consecutive windows" alert.
 *
 * A view rather than an alerting rule, because what to DO about a missed window is a
 * deployment decision (B-025) — but noticing it must not wait for that, and a view can be
 * read from the Ops dashboard today.
 */
create view v_job_health as
select
  expected.job_name,
  expected.interval_seconds,
  last.started_at as last_run_at,
  last.status as last_status,
  -- Two windows, per the jobs contract: one late run is a slow night, two is a job that
  -- has stopped.
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    as missed_two_windows,
  -- A job that runs on time and fails every time is not healthy, and an overdue check
  -- alone would call it fine.
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    or last.status <> 'succeeded'
    as needs_attention
from (values
  ('recompute_freshness', 86400),
  ('roll_journey_statuses', 3600),
  ('purge_deleted_accounts', 86400),
  ('prune_ai_cache', 86400),
  ('prune_rate_limits', 86400)
) as expected(job_name, interval_seconds)
left join lateral (
  select r.started_at, r.status
  from job_runs r
  where r.job_name = expected.job_name and r.status <> 'skipped'
  order by r.started_at desc
  limit 1
) as last on true;

comment on view v_job_health is
  'Last run and overdue flag per scheduled job (BACKEND_ARCHITECTURE jobs contract).';

-- ══════════════════════════════════════════════════════════════════════════════
-- Nobody but the scheduler runs these.
--
-- Each one acts across every user's data by design, which is exactly why no client role
-- may call it. `cron.schedule` runs as the job's owner, so revoking from public costs
-- the scheduler nothing.
-- ══════════════════════════════════════════════════════════════════════════════

revoke all on function recompute_freshness() from public, anon, authenticated;
revoke all on function roll_journey_statuses() from public, anon, authenticated;
revoke all on function purge_deleted_accounts(interval) from public, anon, authenticated;
revoke all on function is_entity_published(text, uuid) from public, anon, authenticated;
revoke all on function run_scheduled_job(text) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Schedules.
--
-- pg_cron reads its expressions in UTC, so IST times are written as their UTC equivalent
-- with the local time in the comment. Getting this wrong is invisible: the job still runs,
-- just at the wrong hour, and nothing ever complains.
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_job record;
begin
  -- Re-running a migration must not leave two copies of a job scheduled.
  for v_job in
    select jobname from cron.job
    where jobname in ('recompute_freshness', 'journey_status_roller',
                      'account_deletion', 'prune_ai_cache', 'prune_rate_limits')
  loop
    perform cron.unschedule(v_job.jobname);
  end loop;

  -- 02:00 IST = 20:30 UTC the previous day.
  -- Every schedule calls the wrapper, never the job function directly: the lock and the
  -- job_runs row are what make a job that stopped running visible.
  perform cron.schedule('recompute_freshness', '30 20 * * *',
                        $job$select run_scheduled_job('recompute_freshness')$job$);
  perform cron.schedule('journey_status_roller', '0 * * * *',
                        $job$select run_scheduled_job('roll_journey_statuses')$job$);
  -- 03:00 IST = 21:30 UTC.
  perform cron.schedule('account_deletion', '30 21 * * *',
                        $job$select run_scheduled_job('purge_deleted_accounts')$job$);
  -- 03:30 IST = 22:00 UTC. Cheap, and keeps the two tables from growing without bound.
  perform cron.schedule('prune_ai_cache', '0 22 * * *',
                        $job$select run_scheduled_job('prune_ai_cache')$job$);
  perform cron.schedule('prune_rate_limits', '10 22 * * *',
                        $job$select run_scheduled_job('prune_rate_limits')$job$);
end;
$$;
