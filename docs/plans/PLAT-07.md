# Feature Implementation Plan — PLAT-07 Production readiness (B-025)

- **Backlog item:** B-025 · **Milestone:** M1 (Day 20) — **the last M1 item**
- **Requirements:** TRD-DEPL-001, TRD-DEPL-003

## 1. What TRD §11.2 Day 20 asks for

> Supabase prod project (Mumbai), migrations push, buckets, SMTP, OAuth redirects, Edge
> Function `keepalive`; Vercel projects for `web` and `ops`, env vars, domains; Playwright
> smoke on prod; nightly backup action; README + runbook; invite 5 pilot planners.

## 2. What I cannot do, stated first

Most of that list is not code. It needs accounts, credentials and a domain that only the
founder can obtain, and **nothing has ever been pushed** — GIT-01 has been open since B-001,
so CI has never executed either.

| Blocked on | Item |
|---|---|
| Push credentials for `fynarctechworks/mandira` | **GIT-01** — 12 unpushed commits; CI has never run |
| Production domain | **OPEN-003** |
| Resend + verified sending domain | **ACCT-01** — magic links do not work in production without it |
| Google OAuth client | **ACCT-02** |
| Gemini key | **ACCT-04** |
| Sentry DSN | **ACCT-06** |
| Vercel + Supabase production projects | Founder-owned |
| Five pilot planners | Founder-owned (**OPEN-007**) |

Building a deploy I cannot run and calling it done would be the wrong kind of finished.

## 3. What I can build, and it is the part that usually gets skipped

1. **A preflight check** that refuses a deploy with missing or obviously-wrong production
   config, rather than discovering it from a traveler.
2. **Nightly backups with a VERIFIED RESTORE.** A backup nobody has restored is not a
   backup — it is a file. The workflow restores every dump into a scratch database and
   asserts the schema and row counts came back.
3. **A deploy pipeline where the migration job gates promotion** (TRD-DEPL-001), so a
   deploy can never reach travelers ahead of the schema it needs.
4. **The runbook** — what to do when something is wrong, written before anyone is under
   pressure.
5. **`vercel.json`** for the keepalive cron.

## 4. Judgement calls

**(a) The backup workflow cannot be tested against production.** It can be tested against
the local stack, which exercises the same `pg_dump`/`psql` path with the same schema.
*What ships:* a script runnable locally (`pnpm db:backup:verify`) and the workflow that
calls it on a schedule. Proven against the real schema, unproven against production's
volume — stated rather than implied.

**(b) The runbook must not be aspirational.** Every procedure in it is either something I
have actually run here, or is explicitly marked as untested-until-deployed. A runbook that
mixes the two is worse than none, because it is trusted at 3am.

## 5. Acceptance criteria

- [x] Preflight refuses a production config with a missing secret, a localhost URL, or a
      service-role key exposed to the browser.
- [x] Nightly backup workflow exists, is encrypted, and **verifies its own restore**.
- [x] `pnpm db:backup:verify` proves a dump restores — run here, not assumed.
- [x] Deploy workflow applies migrations BEFORE promoting either app.
- [x] Runbook covers rollback, restore, a paused project, a stuck queue, key rotation and a
      degraded AI provider — each marked verified or untested.
- [x] Everything blocked is named, with what is needed and who can provide it.

## 6. Verification note (step 9)

| Deliverable | How checked |
|---|---|
| **Backup + restore** | **Run.** `pnpm db:backup:verify` against the local stack: dumped `public` and `auth`, encrypted, restored the ENCRYPTED archive into a scratch database under `ON_ERROR_STOP=1`, compared counts — **55 tables, 140 RLS policies**. Three real problems were found and fixed getting there: the dump's own `CREATE SCHEMA public` aborting the restore, PostGIS living in an `extensions` schema that the scratch database did not mirror, and `auth.users` being referenced by foreign keys — so a public-only dump would have restored nothing and lost every account. |
| **Smoke suite** | **Run**, against a local PRODUCTION build on port 3992 — 8/8. Production mode specifically, because HSTS is omitted in development and a suite that had only ever seen a dev server would not have checked it. |
| Preflight | Run against an empty production environment: 6 blocking, 4 degradations, each naming what breaks and how quietly. |
| Deploy pipeline | Authored, **not executed** — GIT-01 means CI has never run at all. |
| Budget in CI | `pnpm check:bundle` wired into the deploy job; 23 routes, largest 177.4 kB. |
| Runbook | Every procedure marked ✅ verified or ⚠️ untested (D-120). |
| Gates | lint 7/7 · typecheck 7/7 · 616 vitest · 393 pgTAP · 165 Playwright · 8 smoke · build 2/2. |

## 7. What only the founder can do

M1 is code-complete. What remains is not code.

| Needed | Unblocks |
|---|---|
| **GIT-01** — push credentials | 13 unpushed commits; CI has never run |
| **OPEN-003** — a domain | Production URLs |
| Vercel projects + Supabase prod (Mumbai) | The deploy itself |
| **ACCT-01** — Resend + verified domain | Magic links; without it most travelers cannot sign in |
| **ACCT-02 / 04 / 06** — Google OAuth, Gemini, Sentry | Google sign-in, intent extraction, alerting |
| **OPEN-007** — five pilot planners | The pilot |

Deferred here because they need a deployment: Lighthouse on a reference device,
PRD-PLAN-009 re-measured off localhost, and a restore at production volume.
