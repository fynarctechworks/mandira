# Mandhira

An intelligent pilgrimage travel platform: travelers define what matters; Mandhira helps make the journey work — discovery, trusted knowledge, priority-based planning, feasibility, adaptive replanning, NOW/NEXT/LATER live guidance, and a complete Admin/Data Operations platform behind it.

**Status:** Under active development and not yet deployed. The traveler PWA, the Ops platform, the journey engine and the database (migrations, RLS, pgTAP) are implemented through most of M3, with M4 in progress. Current state per feature: `docs/PROJECT_STATUS.md`. The most recent full audit and remediation plan: `docs/PROJECT_AUDIT.md`, `docs/plans/AUDIT-REMEDIATION.md`. What is waiting on the founder: `docs/OPEN_ITEMS.md`.

## Start here
1. `CLAUDE.md` — operating manual for AI-assisted development (mandatory reading).
2. `docs/PROJECT_OVERVIEW.md` — what this is and how it fits together.
3. `docs/PRD.md` / `docs/TRD.md` — canonical product and technical requirements.
4. `docs/PROJECT_STATUS.md` — where each feature stands.
5. `docs/DECISION_LOG.md` — why things are the way they are.

## Repository structure
```text
mandhira/
├── CLAUDE.md
├── README.md
├── docs/                      # PRD, TRD, architecture, registry, status, decisions, plans
├── apps/
│   ├── web/                   # Traveler PWA (Next.js 15, next-intl, Dexie + Serwist offline)
│   └── ops/                   # Ops platform (Next.js 15, desktop web)
├── packages/
│   ├── ui/                    # shadcn base-lyra preset (D-148) + Mandhira domain components
│   ├── db/                    # generated types, Supabase clients, withApi, rate limits
│   ├── journey-engine/        # pure TS engine (health, replanning, NOW/NEXT/LATER)
│   ├── providers/             # AI, routing, weather, email, push, geocoding, capture adapters
│   ├── i18n/                  # locale config and getI18n()
│   └── config/                # eslint, tsconfig, tailwind presets
├── supabase/
│   ├── migrations/            # single source of schema truth (forward-only)
│   ├── tests/                 # pgTAP: RLS, grants, publish gate, jobs, every SQL function
│   └── seed/                  # local dev fixtures (never shipped to production)
├── tests/
│   └── e2e/                   # Playwright flows + axe checks
├── scripts/                   # preflight, backups, bundle budget, privacy boundary, type-gen
└── .github/workflows/         # CI: format, lint, typecheck, unit, engine coverage, build,
                               # bundle budget, migrations + pgTAP, Playwright; deploy; backup
```

Scheduled work runs as pg_cron jobs inside Postgres and as Vercel Cron routes in the apps (D-072, D-124, D-141); there are no Supabase Edge Functions.

## Local development
Requires Node 22, pnpm 10, Docker, and the Supabase CLI **2.117 or newer** (older CLIs cannot parse `supabase/config.toml`).

```bash
pnpm install
supabase start              # local stack on the 544xx ports (D-026)
supabase db reset           # apply migrations and seeds
pnpm db:types               # regenerate packages/db/types.ts after a migration
pnpm dev                    # both apps
```

Copy `.env.example` to `.env.local` in each app and fill the Supabase values from `supabase status`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:engine` (90% coverage gate), `supabase test db`, `pnpm test:e2e`, `pnpm check:bundle` (after a build), `node scripts/check-privacy-boundary.mjs`.
