# Feature Implementation Plan — JOBS-01 Scheduled jobs (pg_cron half)

- **Related requirements:** TRD §5.4, PRD-KNOW-002, PRD-REPT-004, PRD-PRIV-005, PRD-CMPL-001
- **Backlog item:** infrastructure ahead of B-025/B-028 · **Milestone:** M1
- **Objective:** The scheduled work that keeps the product honest as time passes — freshness, journey status, account erasure — plus the contract that makes a job which stopped running visible.

## Why now
Freshness is a function of the clock, not of any write. Without this job every trust badge in the product would be as accurate as the last time somebody happened to edit the row, and the first jobs having landed is exactly when `BACKEND_ARCHITECTURE`'s jobs contract said to add `job_runs`. None of it needs content.

## Scope
- `recompute_freshness` — report-driven downgrade (PRD F14), freshness/confidence re-derivation, reverify tasks for stale criticals.
- `roll_journey_statuses` — draft/upcoming/active/completed, in the journey's own timezone.
- `purge_deleted_accounts` — DPDP erasure after the 30-day grace.
- `critical_fields()` and `is_entity_published()` as the supporting vocabulary.
- `job_runs`, `run_scheduled_job()` (single-flight + logging), `v_job_health`.
- pg_cron schedules for all five jobs, including the `prune_*` functions from 0012.

## Out of scope
- The Edge Function jobs — `ingest_sources` (**B-029**), `refresh_live_feeds` (**B-031**), `schedule_notifications` / `send_notifications` (**B-027**).
- `keepalive` — a Vercel Cron route, so it lands with the API wrapper.
- Alerting on `v_job_health` — what to *do* about a missed window is a deployment decision (**B-025**). Noticing it does not have to wait, so the view exists now.

## Decisions taken during build
- **D-068** — `critical_fields()` restates the §4.4 lists that `0007` inlines, and pgTAP parses the live view definitions to prove they agree.
- **D-069** — a failing job records the failure and returns rather than re-raising.
- **D-070** — the schedules call `run_scheduled_job()`, never the job functions directly.

## Risks
1. **Silence.** A job that quietly does nothing looks exactly like a job with nothing to do. Mitigation: `job_runs` + `v_job_health`, and every job returns a summary of what it changed rather than void.
2. **A permanent downgrade.** A `report_downgrade` that only ever flips on becomes noise nobody can clear. Mitigation: it is computed as a boolean each run, so it lifts when the reports age out or Ops resolves them as correct.
3. **A queue nobody reads.** Mitigation: reverify tasks are raised only for stale *critical* fields on *published* entities, and only when no open task already covers that field.
4. **Timezone drift.** pg_cron reads UTC; "02:00 IST" written as `0 2 * * *` would run at the wrong hour and nothing would complain. Mitigation: UTC expressions with the local time in the comment, and a test asserting the stored schedule string.
5. **Erasure that never happens.** A soft flag that never becomes a real delete is not erasure. Mitigation: the purge is a hard `delete from auth.users`, and a test asserts the profile goes with it.

## Testing strategy
55 pgTAP assertions. `critical_fields` compared against the arrays parsed out of the live view definitions; reverify tasks raised once, not duplicated, suppressed for drafts, and raised again after a task closes; one reporter filing three times ignored while three reporters downgrade, and the downgrade lifting on resolution; re-derivation staged by stepping around the derivation trigger and then corrected; every status transition including the 24-hour grace and archived being left alone; erasure inside and outside the grace; and the runner's log, dispatch allowlist and health view.

**Known limit, stated rather than papered over:** single-flight is asserted structurally (the guard is still in the function) rather than behaviourally. Advisory locks are re-entrant within a session, so a same-session test would pass whether or not the guard worked, and pgTAP cannot open a second connection.

## Acceptance criteria
- [x] All three §5.4 pg_cron jobs implemented and scheduled, plus the two prune jobs.
- [x] Every job idempotent — a second run in the same state changes nothing.
- [x] Every run leaves a `job_runs` row; `v_job_health` flags overdue and failing jobs.
- [x] No client role can execute any job.
- [x] Statuses roll in the journey's own timezone, and `archived` is never undone.
