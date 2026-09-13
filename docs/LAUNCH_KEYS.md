# Production keys and settings

Everything Mandhira needs from outside the codebase to run in production, and where each one goes. The code checks all of it: `node scripts/preflight.mjs --env production` refuses a deploy on anything that would fail quietly, and each app refuses to start in production for the same reasons (`packages/config/env-rules.mjs`).

Never paste a secret into an issue, a commit, a chat or this file. Values go only into the places named below.

## 1. Accounts to create

| # | Account | Why | Blocks launch? |
|---|---|---|---|
| 1 | **Supabase** production project (Mumbai region) | Database, auth, storage, scheduled jobs | Yes |
| 2 | **Vercel**: two projects, `apps/web` and `apps/ops` | Hosting | Yes |
| 3 | **Domain** (OPEN-003), e.g. `app.<domain>` and `ops.<domain>` | Links in emails, push, cookies | Yes |
| 4 | **Resend** plus a verified sending domain (ACCT-01) | Sign-in links (as Supabase SMTP) and email notifications | Yes |
| 5 | **GitHub** push access to the repository (GIT-01) | CI, deploys and backups run from Actions | Yes |
| 6 | **Google AI Studio** (Gemini) key (ACCT-04) | Describe-your-journey, Ops extraction and translation suggestions | No: structured questions instead |
| 7 | **Sentry** project (ACCT-06) | Alerts on server failures | No: logs only |
| 8 | **OpenRouteService** key (ACCT-05) | Real travel times | No: labelled estimates |
| 9 | **MapTiler** key (ACCT-03) | Map preview in the Ops location picker | No |
| 10 | **Google Cloud OAuth client** (ACCT-02) | "Continue with Google" | No: magic link only |
| 11 | *(optional)* **Anthropic** key | AI fallback when Gemini is down | No |

## 2. Values you generate yourself

| Value | How |
|---|---|
| `CRON_SECRET` | `openssl rand -hex 32`. The same value goes into both Vercel projects **and** Supabase Vault (section 4). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `pnpm push:keys`. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is the same public key. |
| `VAPID_SUBJECT` | `mailto:` plus a monitored address, e.g. `mailto:ops@<domain>` |
| `BACKUP_PASSPHRASE` | A long random passphrase, kept in a password manager as well. Without it a backup cannot be restored. |

## 3. Vercel environment variables (Production)

| Variable | Web | Ops | Required |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | Yes. Must be `https://…supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | Yes. Never with a `NEXT_PUBLIC_` prefix. |
| `CRON_SECRET` | ✓ | ✓ | Yes |
| `NEXT_PUBLIC_APP_URL` | ✓ | | Yes. The public `https://` address of the traveler app. |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✓ | | Yes, as a pair. `EMAIL_FROM` looks like `Mandhira <hello@<domain>>`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✓ | | All four or none |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✓ | ✓ | No |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | No |
| `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` | ✓ | ✓ | No. Defaults are `google`, then `anthropic`. |
| `OPENROUTESERVICE_API_KEY` | ✓ | | No |
| `SENTRY_DSN` | ✓ | ✓ | No. Must be the full DSN. |
| `GEOCODING_USER_AGENT` | | ✓ | No. Include a contact address (Nominatim policy). |
| `NEXT_PUBLIC_MAPTILER_KEY` | | ✓ | No |

After changing a `NEXT_PUBLIC_` value, redeploy: those values are built into the page.

## 4. Supabase dashboard and SQL

1. **Auth → URL configuration.** Set the site URL to `NEXT_PUBLIC_APP_URL`. Add redirect URLs for `https://app.<domain>/auth/callback` and `https://ops.<domain>/auth/callback`. Links pointing anywhere else are refused.
2. **Auth → SMTP.** Use the Resend SMTP host with a Resend key and your verified sender. Without this, about two emails an hour get through.
3. **Auth → Email.** Magic link on, OTP expiry 10 minutes (TRD §8).
4. **Auth → Providers → Google.** Enter the OAuth client ID and secret (optional).
5. **Vault**, run once in the SQL editor so that notifications and live feeds are triggered (D-173):
   ```sql
   select vault.create_secret('https://app.<domain>', 'mandhira_web_url');
   select vault.create_secret('<the same CRON_SECRET>', 'mandhira_cron_secret');
   ```
   Until both exist, the Ops dashboard job panel shows `send_notifications` and `refresh_live_feeds` as needing attention.
6. **Database → Extensions.** `pg_cron` and `pg_net` are enabled by the migrations. Confirm they are enabled if the dashboard asks.

## 5. GitHub Actions secrets

The first group is used by `deploy.yml`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `SENTRY_DSN`, the four VAPID values, `AI_PROVIDER`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTESERVICE_API_KEY`, `GEOCODING_USER_AGENT`, `NEXT_PUBLIC_MAPTILER_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_OPS`.

`backup.yml` uses `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`.

Optional secrets may be left unset. The preflight reports them as absent features, not failures.

## 6. Checking it worked

1. Locally, with the production values exported in your shell: `node scripts/preflight.mjs --env production`. It should end with no `BLOCK` lines.
2. After deploying, open the Ops dashboard and check that every job reads "On schedule" within one interval (10 minutes for notifications).
3. Sign in to the traveler app on a phone, install it to the home screen, turn on notifications in Profile, and plan a journey starting tomorrow. The evening-before reminder should arrive at 18:00 IST.
4. If Sentry is set, look in Vercel's logs for a failure's `[env]` or route line. The same event should appear in Sentry.
