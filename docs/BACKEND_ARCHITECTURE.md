# Backend Architecture

## Placement rules
- **Next.js Route Handlers / Server Actions:** request-scoped logic — validation, auth/role checks, engine invocation, AI calls, provider calls, rate limits. Surface: TRD §5.2–§5.3 verbatim.
- **Scheduled/background work (TRD §5.4, as built):** pg_cron inside Postgres for `recompute_freshness`, `journey_status_roller`, `account_deletion`, `prune_ai_cache`, `prune_rate_limits` and `publish_scheduled_entities`, each run through `run_scheduled_job` (single-flight, logged to `job_runs`, watched by `v_job_health`); Vercel Cron routes for `keepalive`, `feeds` and `notifications` in apps/web and `ingest` in apps/ops. There are no Supabase Edge Functions — see D-072, D-124, D-141 for why each moved.
- **Postgres:** integrity that must never be bypassed — RLS, publish-gate checks, versioning/audit triggers, freshness/confidence computation, report auto-downgrade counter.

## Request pipeline (every route)
`withApi(handler, { schema, rateLimit?, roles? })` wrapper: parse+validate (Zod) → auth (`auth.uid()`) → role check server-side → rate limit (`rate_limits` table) → handler → envelope `{ok,data}|{ok,error}` → Sentry on unexpected. No handler skips the wrapper.

## Engine on the server
Same `packages/journey-engine` build; server uses it for: initial build, impact analysis on publish, notification timing. Server never re-implements engine logic ad hoc.

## Jobs contract
Every job: idempotent, single-flight (advisory lock), logs a `job_runs` row (add table when first job lands: id, job_name, started_at, finished_at, status, detail), alert if a scheduled job misses 2 consecutive windows.

## Fallback logic
Implement TRD §5.5 matrix inside providers, not call sites: each provider returns typed `Result` with `degraded: boolean` + `asOf` so UI can label honestly.
