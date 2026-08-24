# Deployment Architecture

Canonical: **TRD §8**. Summary of environments and pipeline:

- **Environments:** local (Supabase Docker) → preview (Vercel previews; staging Supabase project deferred until M3 — until then previews run read-only against seeded local screenshots/fixtures, not prod) → production (Vercel × 2 projects `mandhira-web`, `mandhira-ops`; Supabase `mandhira-prod`, region ap-south-1 Mumbai).
- **Pipeline:** PR → CI (lint, typecheck, vitest ≥90% engine gate, db lint, Playwright smoke Flows 1+3, axe) → merge → migration job (`supabase db push --linked`) gates Vercel promotion → deploy both apps.
- **Config:** env var list TRD §8.4; `CRON_SECRET` guards job endpoints; feature flags table for per-destination toggles.
- **Domains:** vercel.app during development; production `app.<domain>` / `ops.<domain>` once domain purchased (OPEN-003). Ops additionally protected by role gate (+ Vercel password if Pro).
- **PWA releases:** version bump → Serwist update toast; never force-reload during Live mode.
- **Backups/rollback:** nightly encrypted pg_dump artifact until Supabase Pro; Vercel instant rollback; forward-only migrations make rollback safe.
- **Monitoring:** Sentry alerts, Vercel web vitals, queue-age email, free-tier quota alerts at 70%, keepalive cron (Supabase pause prevention).
