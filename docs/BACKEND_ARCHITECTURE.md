# Backend Architecture

## Placement rules
- **Next.js Route Handlers / Server Actions:** request-scoped logic — validation, auth/role checks, engine invocation, AI calls, provider calls, rate limits. Surface: TRD §5.2–§5.3 verbatim.
- **Supabase Edge Functions:** scheduled/background work only (TRD §5.4): `ingest_sources`, `refresh_live_feeds`, `schedule_notifications`, `send_notifications`, `keepalive` (+ pg_cron for `recompute_freshness`, `journey_status_roller`, `account_deletion`).
- **Postgres:** integrity that must never be bypassed — RLS, publish-gate checks, versioning/audit triggers, freshness/confidence computation, report auto-downgrade counter.

## Request pipeline (every route)
`withApi(handler, { schema, rateLimit?, roles? })` wrapper: parse+validate (Zod) → auth (`auth.uid()`) → role check server-side → rate limit (`rate_limits` table) → handler → envelope `{ok,data}|{ok,error}` → Sentry on unexpected. No handler skips the wrapper.

## Engine on the server
Same `packages/journey-engine` build; server uses it for: initial build, impact analysis on publish, notification timing. Server never re-implements engine logic ad hoc.

## Jobs contract
Every job: idempotent, single-flight (advisory lock), logs a `job_runs` row (add table when first job lands: id, job_name, started_at, finished_at, status, detail), alert if a scheduled job misses 2 consecutive windows.

## Fallback logic
Implement TRD §5.5 matrix inside providers, not call sites: each provider returns typed `Result` with `degraded: boolean` + `asOf` so UI can label honestly.
