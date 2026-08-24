# Mandhira — System Architecture

Authoritative diagram and rules: **TRD §2** (do not fork the diagram here; this file adds structure and rationale).

## 1. Components
- `apps/web` — Traveler PWA. Server-components-first; client islands for builder, live mode, maps, sheets. Reads knowledge only via `v_published_*`.
- `apps/ops` — Ops platform. Desktop-first; role-gated at root layout **and** per-route server-side. Reads base tables per RLS.
- `packages/journey-engine` — pure, deterministic, I/O-free. Input `JourneySnapshot`/`KnowledgeBundle`; output `HealthReport`/`ChangeCard`/live projection.
- `packages/providers` — the only place vendor SDKs may be imported (ESLint `no-restricted-imports` enforces).
- `packages/db` — generated types + Zod schemas + typed query helpers. No raw string-built SQL in apps.
- `packages/ui` — tokens + shadcn components per PRD §12.5. Apps never restyle primitives locally.
- `packages/i18n` — next-intl config, `getI18n(value, locale)` fallback helper, transliteration utils.
- `supabase/` — migrations (schema truth), Edge Functions (jobs), seed.

## 2. Non-negotiable invariants
1. **KnowledgeBundle = Dexie snapshot = engine input.** One TypeScript type; changing it requires a migration note in DECISION_LOG and a Dexie version bump.
2. Traveler code path never touches base knowledge tables.
3. Engine has zero imports from apps, providers, or supabase.
4. All external calls go through a provider interface; failures follow TRD §5.5 degradation matrix.
5. Migrations forward-only and additive (TRD-DB-006).
6. No feature bypasses the publish gate, the consent rule (explicit tap), or trust badges — even behind flags.

## 3. Data flow summaries
- **Plan:** intent text → `/api/intent/extract` (AI, ID-grounded) → Brief (user confirms) → `/api/journeys` → engine `buildInitialJourney` → persisted items + health → Dexie snapshot.
- **Live:** Dexie-first read → `getNowNextLater` in browser → Done/Late/Stay → trigger → `evaluateChange` (browser; server for external triggers) → Change Card → user decision → `applyOption` → persist + re-snapshot.
- **Knowledge:** Ops edit → trust panel → validate → review/verify → approve (impact count) → publish → views update → affected journeys get triggers → notifications.

## 4. Cross-cutting concerns
Observability (Sentry both apps, `ai_calls`, `audit_log`, queue-age alerts) · caching (edge cache published content, `ai_cache`, `travel_estimates`, React Query persist) · time (store timestamptz UTC; journeys carry IANA timezone; all display via date-fns-tz) · error envelope (TRD-API-001).

## 5. Repository structure
See `README.md` tree — that tree is the approved Phase-8 structure; deviations require a DECISION_LOG entry.
