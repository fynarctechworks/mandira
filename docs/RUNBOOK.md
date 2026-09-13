# Runbook

What to do when something is wrong, written before anyone is under pressure.

**Every procedure below is marked with how much it is trusted.** A runbook that mixes
"I have run this" with "this should work" is worse than none, because it is read at 3am by
someone who cannot tell the difference.

| Mark | Means |
|---|---|
| ✅ **Verified** | Run here, against the local stack, and it worked. |
| ⚠️ **Untested** | Correct as far as the documentation goes, never executed — there has been nothing to execute it against. |

> **Nothing has been deployed yet.** GIT-01 has been open since B-001, so no commit has
> been pushed and CI has never run. Everything marked ⚠️ becomes verifiable the day the
> first deploy happens, and this file should be revisited then.

---

## First: is it actually broken?

Before anything else, in this order. Two minutes here saves an hour of fixing the wrong
thing.

1. **`/api/heartbeat`** — expect `204`. Anything else means the app cannot reach Supabase.
2. **Supabase dashboard → the project is not PAUSED.** On the free tier a project pauses
   after about a week of inactivity. This is the most likely cause of "everything is down"
   and the least alarming.
3. **Vercel → the latest deployment is `Ready`**, not `Error` or `Building`.
4. **The GitHub Actions tab** — did the nightly backup run? A green backup last night is
   also proof the database was reachable last night.

If the heartbeat answers and travelers still report problems, it is a feature, not the
platform. Go to the relevant section below.

---

## Rolling back a bad deploy

⚠️ **Untested** — no deploy has happened.

**Roll back first, diagnose second.** Vercel rollbacks are instant and reversible; a
traveler standing at a temple gate is not interested in the root cause.

```bash
vercel rollback --token "$VERCEL_TOKEN"     # or the Vercel dashboard → Deployments → …
```

**The migration question, which is the one that matters.** Migrations are forward-only
(D-015), and the deploy pipeline applies them *before* promoting (`deploy.yml`). So after a
rollback the database is one migration AHEAD of the code — and that is deliberately the
safe direction: every migration is additive, so the previous release's code still runs
against it.

**Do not "roll back" a migration to match.** A `DROP COLUMN` to undo an `ADD COLUMN`
destroys whatever was written in between. If a migration is genuinely wrong, write a new
forward migration that corrects it.

---

## Restoring the database

✅ **Verified** — the backup-and-restore path was run against the local stack on
2026-08-26: 55 tables and 140 RLS policies restored from an encrypted archive.
⚠️ **Untested against production volume.**

### Getting a backup

Nightly, from `.github/workflows/backup.yml`, kept 30 days as a run artifact. Each one has
already been restored into a scratch database and compared before it was kept — see
`scripts/backup-verify.sh` for why that is not paranoia.

### Restoring

```bash
# 1. Decrypt.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in mandhira-<stamp>.sql.enc -out restore.sql -pass env:BACKUP_PASSPHRASE

# 2. Restore into a SCRATCH database first. Always. Even now.
psql "$DATABASE_URL" -c "create database restore_check;"
psql "${DATABASE_URL%/*}/restore_check" -v ON_ERROR_STOP=1 -f restore.sql

# 3. Look at it. Row counts, a journey you recognise, `select count(*) from pg_policies`.
# 4. Only then decide whether to promote it.
```

**`ON_ERROR_STOP=1` is not optional.** Without it `psql` prints errors, exits zero, and you
get a database that is missing a constraint or a policy while appearing to have worked.

**Check the RLS policies came back.** Data without its policies is data anyone can read.
The count should match what the source had; `scripts/backup-verify.sh` asserts exactly
this, and it is the check most likely to be skipped by hand.

---

## The Supabase project has paused

⚠️ **Untested** — but this is the failure most likely to happen first.

Free-tier projects pause after about a week of inactivity, and a paused project means the
entire app is down: no reads, no sign-in, nothing.

**Prevention** is `GET /api/heartbeat`, called by Vercel Cron (`vercel.json`), guarded by
`CRON_SECRET`. It was silently broken from B-014 to B-019 because locale middleware
307'd `/api/*` and cron does not follow redirects (D-097) — so if this happens, **check
that the heartbeat is actually being called** before assuming the cron is configured.

**Recovery:** unpause from the dashboard; it takes a few minutes. Then confirm the
heartbeat is answering `204` rather than assuming the cron will fix itself.

---

## A traveler cannot sign in

✅ **Verified locally** (Mailpit) · ⚠️ **Untested in production** (needs ACCT-01).

In likelihood order:

1. **`RESEND_API_KEY` missing, or its sending domain unverified.** Supabase's built-in SMTP
   allows about two emails an hour — well past that, most links simply never arrive, and
   nothing errors. `node scripts/preflight.mjs --env production` catches the missing key;
   only the Resend dashboard catches an unverified domain.
2. **`NEXT_PUBLIC_APP_URL` wrong.** Magic links are built from it, so a wrong value sends
   travelers somewhere that is not this app. Preflight catches localhost; it cannot catch a
   plausible-but-wrong domain.
3. **GoTrue per-address rate limit.** Repeated attempts to the same address are throttled;
   the fix is to wait, and the E2E suite signs in once and reuses the session for this
   exact reason.
4. **The `/auth/*` path being locale-prefixed** — the D-097 class of bug. If magic links
   404, check `middleware.ts`'s matcher before anything else.

---

## Everything answers 429

✅ **Verified** — this happened during B-019 and cost an afternoon.

The rate limiter fails **closed**. If `consume_rate_limit` cannot execute, every
rate-limited route refuses.

**Check first:** does `service_role` have EXECUTE on `consume_rate_limit`? Migration `0012`
revoked it from `public` and took `service_role` with it; `0018` grants it back. A missing
`SUPABASE_SERVICE_ROLE_KEY` produces the same symptom, and preflight catches that one.

```sql
select has_function_privilege('service_role', 'consume_rate_limit(text,text,int,int)', 'execute');
```

Failing closed is the right default — the alternative is a limiter that stops limiting the
moment it breaks — but it does mean this symptom is a configuration problem far more often
than an actual flood.

---

## The AI provider is down or out of quota

✅ **Verified by test** — the provider chain's fallback and refusal paths are unit-tested.

Nothing structural breaks. `/api/intent/extract` degrades and the **structured brief still
works** — it never needed a model. Grounding is enforced in code, so a degraded provider
cannot cause unverified facts to reach a traveler; it can only cause no answer.

If the fallback key (`ANTHROPIC_API_KEY`) is absent, the chain simply has no fallback,
which is a smaller outage than it sounds.

---

## Travel times look wrong

✅ **Verified by test.**

Check `source` on the estimate. With no `OPENROUTESERVICE_API_KEY` — the state today
(ACCT-05) — every estimate is a straight line × a mode factor, labelled `estimated` and
deliberately pessimistic (D-104). That is working as designed, not a fault.

Adding the key upgrades estimates to `routed`. It is an environment variable, not a code
change, and no deploy is needed beyond restarting with it set.

---

## An Ops queue is stuck

⚠️ **Untested.**

`v_job_health` reports the scheduled jobs. A job that has not run is usually pg_cron not
being scheduled rather than the job failing — `job_runs` distinguishes them: a failed run
leaves a row, a job that never ran leaves nothing.

Single-flight is advisory-lock based (D-070), so a crashed run releases its lock when the
session ends. There is no stuck lock to clear by hand.

---

## Rotating a key

⚠️ **Untested.**

| Key | Rotate freely? |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Yes — update Vercel, redeploy. Brief 429s while both are in flight. |
| `CRON_SECRET` | Yes. The heartbeat 404s until Vercel Cron has the new value. |
| `RESEND_API_KEY` | Yes. |
| `BACKUP_PASSPHRASE` | **Careful.** Existing archives are encrypted with the OLD one. Keep it until every archive encrypted under it has expired, or those backups are gone. |
| **VAPID keys** | **Not routine.** Every existing push subscription is signed against the old pair; changing it silently stops notifications for everyone until each browser re-subscribes. |

---

## Notifications or live feeds stopped

They are dispatched by pg_cron, not Vercel (D-173). Check in this order:

1. The Ops dashboard job panel: `send_notifications` / `refresh_live_feeds`.
2. `select job_name, status, detail, started_at from job_runs where job_name in ('send_notifications','refresh_live_feeds') order by started_at desc limit 10;`
   - `not_configured` — the Vault secrets are missing: see `docs/LAUNCH_KEYS.md` §4.
   - `http_status: 401` — the Vault `mandhira_cron_secret` differs from the app's `CRON_SECRET`. Update one to match (Rotating a key, below).
   - `http_status: 404` — `CRON_SECRET` is not set in the web project, or the URL in Vault is wrong.
   - `timed_out` — the route took over 55 s; check Vercel's function logs for that minute.
3. The route itself answers with a summary: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.<domain>/api/cron/notifications` returns `sent`, `failed`, `cancelled` and `notConfigured` (which channels have no keys).

## A server refuses to start

In production both apps validate their configuration at start (`instrumentation.ts`) and refuse on anything `docs/LAUNCH_KEYS.md` marks required. The Vercel log names every problem on lines beginning `[env] BLOCK`. Fix the variable, redeploy. Running `node scripts/preflight.mjs --env production` with the same values shows the same list before deploying.

## What is still unproven

Being honest about this is more useful than a longer runbook.

- **No deploy has ever happened.** GIT-01 blocks it. CI has never executed, so
  `supabase/setup-cli` on a clean runner and the generated-types staleness diff are
  unverified in practice.
- **Lighthouse and LCP** (TRD-PERF-001) need a deployed URL and a reference device. Bundle
  size is enforced (`pnpm check:bundle`); the field numbers are not yet real.
- **PRD-PLAN-009's 500 ms** was measured at p50 119 ms / p95 199 ms on localhost — a floor,
  not a production number.
- **PRD-LIVE-005** (≥90 % task success, n≥10) needs ten people.
- **Restore at production volume** is unproven. The path is verified; the scale is not.
