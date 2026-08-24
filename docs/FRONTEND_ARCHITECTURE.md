# Frontend Architecture

Applies to `apps/web` and `apps/ops`. Stack pins: TRD §3 (TRD-ARCH-006).

## Routing & rendering
- App Router; traveler routes locale-prefixed `/[locale]/…` (next-intl). Ops is en-only until M4 but strings still externalised.
- Server components by default. Client components only for: journey builder timeline, live mode, sheets, maps, forms, offline hooks. Mark deliberately with `"use client"` and keep leaf-level.
- Route groups: web → `(discover)`, `(plan)`, `(journey)`, `(account)`, `share/[token]`; ops → `(queues)`, `(entities)`, `(sources)`, `(admin)`, `(dashboards)`.

## State layers (strict ownership)
1. **Server state:** TanStack Query v5; query keys `['published', table, params]`, `['journey', id]`, `['ops', table, params]`. Persisted via sync-storage persister for offline.
2. **Offline canonical:** Dexie (`apps/web/lib/offline/db.ts`, stores per TRD §4.8). Read-through hook `useOfflineFirst(queryKey, dexieRead, fetch)`.
3. **UI/session state:** Zustand slices `useLiveStore` (current item, timers), `useBuilderStore` (drag state), `useUiStore` (sheets, banners). No server data in Zustand.
4. **Forms:** react-hook-form + Zod resolver; schemas imported from `packages/db/schemas`.

## Component rules
- Import primitives from `packages/ui` only; tokens are CSS variables — never hex literals in app code (lint rule).
- Required shared components (PRD §12.5): TierChip, TrustBadge(+TrustSheet), HealthPill, ItemCard, NowCard, ChangeCard, BottomSheet(vaul), ChecklistRow, OfflineBanner, SourcesFooter, OpsDataTable, SideBySideDiff.
- Every async view implements loading (skeleton), empty, error (with retry), success. Copy per PRD §12.7 — no "error/failed" vocabulary.
- Lists >50 rows virtualised (`@tanstack/react-virtual`); timeline items memoized; engine in Web Worker (comlink) when items >40.

## PWA
Serwist: precache shell; runtime SWR for `v_published_*` and images; network-only for auth/journey writes. `NEXT_PUBLIC_APP_VERSION` gates the update toast; never auto-reload during an active journey day (TRD-DEPL-002).

## Performance budget (CI-checked)
Per-route first-load JS ≤180 kB gz (M1) — `@next/bundle-analyzer` in CI; images via next/image ≤800 px mobile variants; fonts subset via next/font. Targets: TRD §9.

## Accessibility
WCAG 2.2 AA baseline; axe in Playwright on key screens; focus management on sheet open/close; icon+text for every tier/health/trust state; 200% text-scale layout tests.
