-- pgTAP: TRD §5.4 scheduled jobs (the pg_cron half).
--
-- Scheduled work is the least observable code in the system: it runs at 02:00 with nobody
-- watching, and a job that quietly does nothing looks exactly like a job with nothing to
-- do. So every one of these is called directly and its effect asserted, and the tests care
-- as much about what the jobs LEAVE ALONE as about what they change.

begin;
select plan(55);

select has_function('public', 'critical_fields', 'critical_fields() exists');
select has_function('public', 'recompute_freshness', 'recompute_freshness() exists');
select has_function('public', 'roll_journey_statuses', 'roll_journey_statuses() exists');
select has_function('public', 'purge_deleted_accounts', 'purge_deleted_accounts() exists');
select has_function('public', 'is_entity_published', 'is_entity_published() exists');

-- ══════════════════════════════════════════════════════════════════════════════
-- critical_fields must agree with what the published views actually gate on.
--
-- Parsed out of the live view definitions rather than restated, so this fails if either
-- side moves. A drift here would let a field stop being reverified while still gating
-- publication — the job would go quiet and nothing would look wrong.
-- ══════════════════════════════════════════════════════════════════════════════

create function view_gated_fields(p_view text) returns text[]
language sql stable as $fn$
  select array_agg(m[1] order by ord)
  from regexp_matches(
         -- The capture group takes only what is inside ARRAY[...], so the table-name
         -- argument to critical_fields_gated does not end up in the field list.
         substring(pg_get_viewdef(p_view::regclass)
                   from 'critical_fields_gated\([^)]*ARRAY\[([^\]]*)\]'),
         '''([a-z_0-9]+)''::text', 'g'
       ) with ordinality as t(m, ord);
$fn$;

select is(
  view_gated_fields('v_published_places'),
  critical_fields('places'),
  'critical_fields(places) matches what v_published_places gates on'
);
select is(
  view_gated_fields('v_published_experiences'),
  critical_fields('experiences'),
  'critical_fields(experiences) matches what v_published_experiences gates on'
);
select is(
  view_gated_fields('v_published_transport_connections'),
  critical_fields('transport_connections'),
  'critical_fields(transport_connections) matches its view'
);
select is(
  critical_fields('availability_rules'), array[]::text[],
  'availability rules are critical whole-entity, so they name no fields'
);
select is(
  critical_fields('not_a_table'), null,
  'an unknown table is NULL, which a caller can tell apart from "no fields"'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Fixtures
-- ══════════════════════════════════════════════════════════════════════════════

insert into auth.users (id, instance_id, aud, role, email)
values
  ('d1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'traveler@jobs.test'),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'leaving@jobs.test'),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'justleft@jobs.test');

insert into sources (id, name, source_type, tier)
values ('d2000000-0000-4000-8000-000000000001', 'Temple authority', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('d3000000-0000-4000-8000-000000000001', 'jobs-test', '{"en":"Jobs Test"}'::jsonb,
        'SRID=4326;POINT(83.0107 25.3109)', 5, 'published');

-- One published place and one still in draft, so "only what a traveler can see" is testable.
insert into places (id, destination_id, slug, name_i18n, place_type, location, status)
values
  ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001',
   'live-temple', '{"en":"Live Temple"}'::jsonb, 'temple',
   'SRID=4326;POINT(83.0110 25.3112)', 'published'),
  ('d4000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001',
   'draft-temple', '{"en":"Draft Temple"}'::jsonb, 'temple',
   'SRID=4326;POINT(83.0120 25.3122)', 'draft');

select ok(
  is_entity_published('places', 'd4000000-0000-4000-8000-000000000001'),
  'a published place reads as published'
);
select ok(
  not is_entity_published('places', 'd4000000-0000-4000-8000-000000000002'),
  'a draft place does not'
);
select ok(
  not is_entity_published('pg_class', 'd4000000-0000-4000-8000-000000000001'),
  'a table that is not knowledge is refused rather than queried'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- recompute_freshness
-- ══════════════════════════════════════════════════════════════════════════════

-- Verified 200 days ago: stale by the §4.3 thresholds, on a place travelers can see.
insert into trust_records
  (entity_table, entity_id, field_name, source_id, source_tier, verification_status, verified_at)
values
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule',
   'd2000000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '200 days'),
  ('places', 'd4000000-0000-4000-8000-000000000002', 'opening_schedule',
   'd2000000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '200 days');

select is(
  (select freshness::text from trust_records
   where entity_id = 'd4000000-0000-4000-8000-000000000001'),
  'stale',
  'the derivation trigger already marks a 200-day-old record stale'
);

select is(
  (recompute_freshness() ->> 'reverify_tasks_created')::int,
  1,
  'a stale critical field on a published place raises exactly one reverify task'
);

select is(
  (select count(*)::int from review_tasks
   where task_type = 'reverify' and entity_id = 'd4000000-0000-4000-8000-000000000002'),
  0,
  'a stale field on a DRAFT place raises nothing — it is not yet anybody''s problem'
);

select is(
  (recompute_freshness() ->> 'reverify_tasks_created')::int,
  0,
  'running again raises no duplicate; a queue that grows nightly stops being read'
);

-- Once the task is closed, a still-stale field is raised again — the field is still stale.
update review_tasks set status = 'done' where task_type = 'reverify';
select is(
  (recompute_freshness() ->> 'reverify_tasks_created')::int,
  1,
  'a closed task does not suppress the next one while the field is still stale'
);

-- ── Report-driven downgrade (PRD F14) ────────────────────────────────────────
insert into user_reports (entity_table, entity_id, field_name, report_type, reporter_hash)
values
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule', 'timing_changed', 'r1'),
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule', 'timing_changed', 'r1'),
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule', 'timing_changed', 'r1');

select is(
  (recompute_freshness() ->> 'report_downgrades_changed')::int,
  0,
  'one person reporting three times is one person disagreeing, not three'
);

insert into user_reports (entity_table, entity_id, field_name, report_type, reporter_hash)
values
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule', 'timing_changed', 'r2'),
  ('places', 'd4000000-0000-4000-8000-000000000001', 'opening_schedule', 'timing_changed', 'r3');

select is(
  (recompute_freshness() ->> 'report_downgrades_changed')::int,
  1,
  'three independent reporters within 14 days downgrade the field'
);

select ok(
  (select report_downgrade from trust_records
   where entity_id = 'd4000000-0000-4000-8000-000000000001'),
  'the downgrade is recorded on the trust record itself'
);

-- Ops checks the source and confirms the field is right: the downgrade must lift.
update user_reports set status = 'resolved_confirmed_correct'
where entity_id = 'd4000000-0000-4000-8000-000000000001';

select is(
  (recompute_freshness() ->> 'report_downgrades_changed')::int,
  1,
  'resolving the reports as correct lifts the downgrade again'
);

select ok(
  not (select report_downgrade from trust_records
       where entity_id = 'd4000000-0000-4000-8000-000000000001'),
  'a flag that only ever went one way would become permanent noise'
);

-- ── Re-derivation as time passes ─────────────────────────────────────────────
-- Force a stored value that disagrees with what the clock now implies, the way a record
-- verified 89 days ago quietly becomes aging on its 91st.
alter table trust_records disable trigger trust_records_apply_derivations;
update trust_records set freshness = 'fresh'
where entity_id = 'd4000000-0000-4000-8000-000000000001';
alter table trust_records enable trigger trust_records_apply_derivations;

select is(
  (select freshness::text from trust_records
   where entity_id = 'd4000000-0000-4000-8000-000000000001'),
  'fresh',
  'the stored value can be made to disagree with the clock'
);

select is(
  (recompute_freshness() ->> 'trust_records_rederived')::int,
  1,
  'the job finds the record whose derived value the clock has changed'
);

select is(
  (select freshness::text from trust_records
   where entity_id = 'd4000000-0000-4000-8000-000000000001'),
  'stale',
  'and puts it back to what its verification date actually means'
);

select is(
  (recompute_freshness() ->> 'trust_records_rederived')::int,
  0,
  'with nothing out of date it touches no rows, so updated_at stays a real signal'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- roll_journey_statuses
-- ══════════════════════════════════════════════════════════════════════════════

insert into journeys (id, owner_user_id, title, status, start_date, end_date, timezone)
values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
   'Next month', 'draft', (now() at time zone 'Asia/Kolkata')::date + 30,
   (now() at time zone 'Asia/Kolkata')::date + 33, 'Asia/Kolkata'),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
   'Today', 'upcoming', (now() at time zone 'Asia/Kolkata')::date,
   (now() at time zone 'Asia/Kolkata')::date + 2, 'Asia/Kolkata'),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001',
   'Long over', 'active', (now() at time zone 'Asia/Kolkata')::date - 10,
   (now() at time zone 'Asia/Kolkata')::date - 5, 'Asia/Kolkata'),
  ('d5000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001',
   'Ended yesterday', 'active', (now() at time zone 'Asia/Kolkata')::date - 3,
   (now() at time zone 'Asia/Kolkata')::date - 1, 'Asia/Kolkata'),
  ('d5000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001',
   'Put away', 'archived', (now() at time zone 'Asia/Kolkata')::date - 40,
   (now() at time zone 'Asia/Kolkata')::date - 35, 'Asia/Kolkata'),
  ('d5000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000001',
   'No dates yet', 'draft', null, null, 'Asia/Kolkata');

select ok((roll_journey_statuses() ->> 'journeys_rolled')::int >= 3, 'the roller moves journeys');

select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000001'),
  'upcoming',
  'a dated future journey leaves draft'
);
select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000002'),
  'active',
  'a journey starting today becomes active'
);
select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000003'),
  'completed',
  'a journey well past its end date completes'
);
select isnt(
  (select completed_at from journeys where id = 'd5000000-0000-4000-8000-000000000003'),
  null,
  'and records when it completed'
);
select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000004'),
  'active',
  'a journey that ended yesterday keeps its 24-hour grace, so the evening is still there'
);
select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000005'),
  'archived',
  'an archived journey is the traveler''s own decision and nothing scheduled undoes it'
);
select is(
  (select status::text from journeys where id = 'd5000000-0000-4000-8000-000000000006'),
  'draft',
  'a journey with no dates has nothing to roll to'
);

select is(
  (roll_journey_statuses() ->> 'journeys_rolled')::int,
  0,
  'a second run changes nothing, so the hourly job is not a write storm'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- purge_deleted_accounts
-- ══════════════════════════════════════════════════════════════════════════════

update profiles set deleted_at = now() - interval '31 days'
where id = 'd1000000-0000-4000-8000-000000000002';
update profiles set deleted_at = now() - interval '2 days'
where id = 'd1000000-0000-4000-8000-000000000003';

select is(
  (purge_deleted_accounts() ->> 'accounts_purged')::int,
  1,
  'an account past its grace period is hard-deleted'
);

select is(
  (select count(*)::int from auth.users where id = 'd1000000-0000-4000-8000-000000000003'),
  1,
  'one still inside the grace period is left alone — most deletions are a bad afternoon'
);

select is(
  (select count(*)::int from profiles where id = 'd1000000-0000-4000-8000-000000000002'),
  0,
  'the cascade takes the profile with the user; a soft flag is not erasure'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Nobody but the scheduler
-- ══════════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)::int from (
     values ('recompute_freshness()'), ('roll_journey_statuses()'),
            ('purge_deleted_accounts(interval)'), ('is_entity_published(text, uuid)')
   ) as f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute')
      or has_function_privilege('anon', f.sig, 'execute')),
  0,
  'no client role may run a job that acts across every user''s data'
);

select is(
  (select count(*)::int from cron.job
   where jobname in ('recompute_freshness', 'journey_status_roller', 'account_deletion',
                     'prune_ai_cache', 'prune_rate_limits')),
  5,
  'all five jobs are scheduled — a function nobody calls is not a job'
);

select is(
  (select schedule from cron.job where jobname = 'recompute_freshness'),
  '30 20 * * *',
  'the daily job runs at 02:00 IST, written as its UTC equivalent'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- run_scheduled_job — the jobs contract (BACKEND_ARCHITECTURE)
--
-- The wrapper is what makes a job that stopped running visible, so its own failure modes
-- matter more than the jobs it wraps.
-- ══════════════════════════════════════════════════════════════════════════════

select has_table('public', 'job_runs', 'job_runs exists');
select has_function('public', 'run_scheduled_job', 'run_scheduled_job() exists');

select throws_ok(
  $$ select run_scheduled_job('drop_everything') $$,
  'Unknown job: drop_everything',
  'the dispatcher runs only the jobs it knows, not whatever it is handed'
);

delete from job_runs;

select isnt(
  (select run_scheduled_job('roll_journey_statuses')), null,
  'the wrapper returns the job''s own summary'
);

select is(
  (select count(*)::int from job_runs where job_name = 'roll_journey_statuses'),
  1,
  'and leaves exactly one row saying it ran'
);

select is(
  (select status from job_runs where job_name = 'roll_journey_statuses'),
  'succeeded',
  'recorded as succeeded'
);

select isnt(
  (select finished_at from job_runs where job_name = 'roll_journey_statuses'), null,
  'with a finish time, so a run that hung is distinguishable from one that worked'
);

select isnt(
  (select detail from job_runs where job_name = 'roll_journey_statuses'), null,
  'and the job''s own summary, so the row answers "did the work happen"'
);

/*
 * Single-flight is asserted STRUCTURALLY, not behaviourally, and it is worth saying why.
 *
 * Postgres advisory locks are re-entrant within a session: this test would take the lock
 * and then `run_scheduled_job` would take it again quite happily, so a same-session test
 * would pass whether or not the guard worked. Demonstrating it properly needs two
 * connections, which pgTAP has no way to open. Checking that the guard is still in the
 * function at least fails if someone removes it.
 */
select matches(
  (select prosrc from pg_proc where proname = 'run_scheduled_job'),
  'pg_try_advisory_lock',
  'the wrapper still takes a lock before running anything'
);

select matches(
  (select prosrc from pg_proc where proname = 'run_scheduled_job'),
  'pg_advisory_unlock',
  'and releases it, including on the failure path'
);

select is(
  (select run_scheduled_job('prune_ai_cache') ->> 'deleted'),
  '0',
  'a job with nothing to do still runs and reports having done nothing'
);

-- ── Job health ───────────────────────────────────────────────────────────────
select is(
  (select missed_two_windows from v_job_health where job_name = 'recompute_freshness'),
  true,
  'a job with no successful run at all reads as overdue'
);

select is(
  (select needs_attention from v_job_health where job_name = 'roll_journey_statuses'),
  false,
  'one that just succeeded does not'
);

select * from finish();
rollback;
