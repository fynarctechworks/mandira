# Feature Implementation Plan — API-01 The route pipeline (`withApi`) and keepalive

- **Related requirements:** TRD-API-001, TRD-SEC-001, PRD-ACCT-001, PRD §12.7, TRD §5.4
- **Backlog item:** infrastructure ahead of B-018/B-019 · **Milestone:** M1
- **Objective:** The wrapper `BACKEND_ARCHITECTURE` says no handler may skip, built before the first handler exists — plus the one cron route that has to live outside Supabase.

## Why now
`withApi` needs `rateLimit()`, which landed with B-018 part 1. Building it before the first route means no route ever has to be retrofitted into it, and the pipeline is the thing that turns a database refusal into an answer a person can act on.

## Scope
- `createWithApi` in `@mandhira/db/api`: validate → authenticate → authorize → rate-limit → handle → `{ok,data} | {ok,error}` envelope, with `no-store` on every response.
- `ApiError`, so a handler can refuse in its own words instead of flattening to one apology.
- `apps/web/lib/api.ts` — the traveler app's bound instance.
- `GET /api/cron/keepalive` + `apps/web/vercel.json`.

## Out of scope
- Any actual route. `POST /api/journeys`, `/api/intent/extract` and the rest arrive with **B-018**/**B-019**, which wait on content.
- The Ops app's bound instance — Ops uses Server Actions (`opsAction`) today and gets one when it first needs a route handler.
- Sentry. `onUnexpected` is the hook; wiring it is **B-024**.

## Decisions taken during build
- **D-071** — `withApi` lives in `@mandhira/db/api` rather than a new `packages/api`.
- **D-072** — `keepalive` is a Vercel Cron route, not a Supabase Edge Function. **This resolves a documented conflict** (see below).
- **D-073** — `createWithApi` takes its clients as injected dependencies rather than importing them.

## Conflict found and resolved
`docs/TRD.md` §5.4 assigns `keepalive` to **Vercel Cron**. `docs/BACKEND_ARCHITECTURE.md` lists it among the **Supabase Edge Functions**. Per CLAUDE.md §2 the TRD outranks the architecture docs, and here it is also independently right: an Edge Function that pings Supabase runs *on* Supabase, so a paused project could not wake itself. Implemented per the TRD and recorded as D-072; `BACKEND_ARCHITECTURE.md` should have `keepalive` struck from its Edge Function list.

## Risks
1. **A route that skips the pipeline.** Mitigation: the wrapper is the only exported way to build a handler, and `apps/web/lib/api.ts` is the only place clients are bound. The keepalive route deliberately does not use it — it has no user, no input and no rate limit, and the comment says so.
2. **Leaking internals in an error.** Mitigation: anything unrecognised is reported through `onUnexpected` and flattened to one message; a test asserts a table name in a driver message never reaches the wire.
3. **Guests sharing a rate-limit bucket.** Real and open — see below.
4. **An unauthenticated cron endpoint.** Mitigation: a missing `CRON_SECRET` closes the route (404) rather than opening it, and the secret is checked before the database is touched.

## Known gap — OPEN-011
Nothing sets the device cookie that identifies a guest yet; the guest draft that issues it is **B-019**. Until then every guest falls into one `"anonymous"` bucket, which is harmless while no guest-facing rate-limited route exists and unacceptable the moment one does — the first traveler to spend their ten intent extractions would spend everyone's. `/api/intent/extract` must not ship before the cookie does. Not keyed on IP by choice: TRD §6.2 keys on a session, and DPDP treats an IP as personal data.

## Testing strategy
25 tests. The pipeline: validation with field-level errors, query-string input for GET, a non-JSON body refused rather than crashing; guest-allowed vs auth-required vs role-required, and a refusal that does not name the role it wanted; the limit counted against a user id or the app's guest key, checked *before* the handler runs, and answered with a usable `Retry-After`; a handler's own refusal preserved, a duplicate key turned into 409, an unexpected throw reported and flattened. Plus every error message asserted against PRD §12.7's forbidden words, and `no-store` on every response. The keepalive route: authorised, unauthorised, unconfigured, and a database that did not answer.

## Acceptance criteria
- [x] One pipeline: validate → auth → roles → rate limit → handle → envelope.
- [x] `no-store` on every API response.
- [x] No driver message, stack trace, or role name ever reaches a caller.
- [x] Copy passes PRD §12.7 — asserted, not just written carefully.
- [x] Keepalive runs daily from outside Supabase and is closed without its secret.
