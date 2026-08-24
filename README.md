# Mandhira

An intelligent pilgrimage travel platform: travelers define what matters; Mandhira helps make the journey work — discovery, trusted knowledge, priority-based planning, feasibility, adaptive replanning, NOW/NEXT/LATER live guidance, and a complete Admin/Data Operations platform behind it.

**Status:** Project foundation complete. Application implementation NOT started.

## Start here
1. `CLAUDE.md` — operating manual for AI-assisted development (mandatory reading).
2. `docs/PROJECT_OVERVIEW.md` — what this is and how it fits together.
3. `docs/PRD.md` / `docs/TRD.md` — canonical product and technical requirements.
4. `docs/DEVELOPMENT_ROADMAP.md` + `docs/DEVELOPMENT_BACKLOG.md` — what to build, in order.
5. `docs/PROJECT_READINESS_REPORT.md` — open decisions and risks before coding.

## Planned repository structure (to be created in Milestone 0 — see docs/ARCHITECTURE.md §5)
```text
mandhira/
├── CLAUDE.md
├── README.md
├── docs/                      # all project documentation (this foundation)
│   └── templates/
├── apps/
│   ├── web/                   # Traveler PWA (Next.js 15, mobile-first)
│   └── ops/                   # Ops platform (Next.js 15, desktop web)
├── packages/
│   ├── ui/                    # shadcn-based components + design tokens
│   ├── db/                    # generated types, Zod schemas, query helpers
│   ├── journey-engine/        # pure TS engine (health, replanning, NOW/NEXT/LATER)
│   ├── providers/             # AiProvider, RoutingProvider, WeatherProvider, EmailProvider, PushProvider, GeocodingProvider
│   ├── i18n/                  # next-intl config, locale utilities, getI18n()
│   └── config/                # eslint, tsconfig, tailwind presets
├── supabase/
│   ├── migrations/            # single source of schema truth (forward-only)
│   ├── functions/             # Edge Functions (ingestion, feeds, notifications, keepalive)
│   └── seed/                  # seed scripts for local dev fixtures
├── tests/
│   └── e2e/                   # Playwright flows + axe checks
├── scripts/                   # backup, type-gen, ui-strings build, checks
└── .github/workflows/         # CI: lint, typecheck, vitest, db lint, e2e smoke
```

No application code exists yet by design — see `docs/PROJECT_READINESS_REPORT.md` → Recommended First Development Task.
