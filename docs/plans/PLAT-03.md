# Feature Implementation Plan — PLAT-03 Schema part 1 (enums, locales, sources, trust, versions, audit, tasks)

- **Related requirements:** TRD-DB-001 (schema per §4), TRD-DB-002 (enums), TRD-DB-004 (audit/versions)
- **Backlog item:** B-003  ·  **Milestone:** M0 (Day 2)
- **Objective:** Stand up the local Supabase project and lay the foundation half of the schema — every shared enum, the locale/translation tables, and the whole sources-and-trust spine (sources, trust records, captures, extractions, conflicts, versions, audit, review tasks) — so the knowledge layer in B-004 has something to attach trust and history to.

## Scope
- `supabase init` + local stack; extensions `postgis`, `pg_cron`, `vector`, `pg_trgm`, `unaccent`.
- `0001_enums.sql` — all 26 §4.1 enums, verbatim names and values.
- `0002_locales_sources_trust.sql` — §4.2 (`locales`, `ui_strings`) and §4.3 (`sources`, `trust_records`, `source_captures`, `ingestion_jobs`, `ai_extractions`, `change_candidates`, `conflicts`, `entity_versions`, `audit_log`, `review_tasks`).
- Shared plumbing: `set_updated_at()` trigger function, a reusable `record_entity_version()` trigger template, and the `freshness`/`confidence` derivation functions the TRD specifies for `trust_records`.
- Seed `locales` with en/te/hi (D-014).

## Out of scope
- Knowledge, users, journeys, reports tables and the `v_published_*` views → **B-004**.
- Generated types + Zod schemas → **B-005**. RLS policies → **B-006**. Auth → **B-007**.
- Wiring `pg_cron` schedules for freshness recomputation: the functions are defined here, the *schedule* lands with the jobs work so it is not silently running against an empty database.
- M3 ingestion behaviour. Per TRD §11.2 Day 2, captures/extractions/conflicts **tables** are created now for schema completeness; nothing reads or writes them until B-029.

## Dependencies
PLAT-01 (COMPLETE). Docker + Supabase CLI on the dev machine. No app code depends on this yet.

## Existing functionality affected
None — `supabase/migrations/` is empty. This is the first migration.

## Database changes
Two forward-only, additive migrations (D-015). New enum types and tables only; nothing dropped or altered. `trust_records` carries a unique constraint on (`entity_table`, `entity_id`, `field_name`) per §4.3.

Derived columns follow the TRD rules exactly:
- `freshness`: ≤90 d → `fresh`, ≤180 d → `aging`, else (or past `valid_until`) → `stale`.
- `confidence`: T1/T2 + verified + fresh → `high`; verified + aging, or T3 + verified + fresh → `medium`; else `low`.
Both are computed by a function so B-006's cron and B-011's Ops panel share one definition.

## Backend/API changes
None.

## Frontend changes
None.

## Permission changes
None yet — RLS is enabled on every table as it is created (deny-by-default until B-006 adds policies), so no table is ever briefly world-readable.

## Integration changes
None.

## Files expected to change
`supabase/config.toml`, `supabase/migrations/0001_enums.sql`, `supabase/migrations/0002_locales_sources_trust.sql`, `supabase/seed/seed.sql`, `docs/PROJECT_STATUS.md`, `docs/REQUIREMENTS_REGISTRY.md`, and CI (`.github/workflows/ci.yml`) to add `supabase db lint`.

## Risks
1. **Enum drift.** Values are normative and referenced across engine, API and UI. Mitigation: transcribed verbatim from §4.1 and covered by a test that asserts the DB's enum labels match the TRD list exactly.
2. **`entity_versions` trigger applied inconsistently** in B-004 → silent history gaps. Mitigation: ship one reusable trigger function plus a helper that attaches it, so B-004 attaches rather than reimplements.
3. **Docker disk pressure** on this machine (C: has ~33 GB free; Supabase images are several GB). Mitigation: checked before starting; stack can be stopped between sessions.

## Edge cases
`valid_until` in the past forces `stale` regardless of age; `field_name IS NULL` means whole-entity trust and must still be unique (Postgres treats NULLs as distinct — needs `NULLS NOT DISTINCT` on the constraint); enum additions are append-only for backward compatibility.

## Testing strategy
- Enum contract test: every §4.1 enum exists with exactly the listed labels in order.
- Trigger tests: `updated_at` advances on update; `record_entity_version()` inserts a row with correct `changed_fields`.
- Derivation tests: `freshness`/`confidence` truth table across tier × verification × age × `valid_until`.
- `supabase db lint` in CI; `supabase db reset` must apply cleanly from scratch.
- RLS-enabled assertion: every new table has `rowsecurity = true`.

## Acceptance criteria
- [ ] `supabase db reset` applies both migrations cleanly on an empty database.
- [ ] All 26 enums present with exact TRD labels.
- [ ] All 12 tables present, RLS enabled, `updated_at` triggers attached where the table has the column.
- [ ] `locales` seeded with en/te/hi.
- [ ] `supabase db lint` clean; `pnpm test` green.

## Rollback considerations
Forward-only. Nothing deployed and no data yet, so a mistake is corrected by editing the migration and re-running `supabase db reset` until B-025 promotes anything to a real environment.

---

# Part 2 — B-004 (Day 3): knowledge, users, journeys, reports, published views

- **Related requirements:** TRD-DB-001/004/005, TRD-ARCH-004, PRD-KNOW-001, PRD-KNOW-003
- **Backlog item:** B-004 · **Milestone:** M0 (D3)
- **Objective:** Complete the schema — the knowledge model travelers read, the journey model the engine writes, and the `v_published_*` views that make the publish gate structural rather than a convention.

## Scope
- `0003_knowledge.sql` — §4.4 in FK-safe order (media → destinations → places/routes → experiences → the rest), with tsvector generated columns, `embedding vector(768)`, GiST/GIN/trgm indexes, and `record_entity_version()` attached to every publishable table.
- `0004_users.sql` — §4.5 profiles, user_roles, traveler_profiles (sensitive), saved_places, personalization_signals.
- `0005_journeys.sql` — §4.6 journeys, items, dependencies, change events, prepare tasks, records, notes, shares.
- `0006_reports_notifications.sql` — §4.7 reports, push subscriptions, notifications, analytics, feature flags.
- `0007_published_views.sql` — the 9 `v_published_*` views plus `entity_trust()`, `source_tier_label()` and `critical_fields_gated()`.

## Out of scope
RLS policies (B-006), generated types + Zod (B-005), any Ops editor that writes these tables (B-009+), pg_cron schedules, embedding population (B-032).

## Database changes
51 tables total, 9 views, 11 version triggers. All additive and forward-only (D-015). Constraints encode product rules rather than leaving them to application code: a FIXED item must carry `fixed_start_at` (the return guard's anchor, PRD-PLAN-006); an experience anchors to exactly one of place/route; a journey belongs to a user or a device draft; duration triples must be ordered.

## Permission changes
Every new table has RLS enabled at creation. `anon`/`authenticated` are granted SELECT on the published views only — see D-029 for why the views are definer's-rights.

## Risks
1. **The publish gate is the highest-consequence code in the schema.** Mitigation: pgTAP drives a place through every gate state (no trust → partial trust → gated → unpublished → soft-deleted) rather than asserting the view exists.
2. **A later migration adds a publishable table and forgets its version trigger.** Mitigation: a schema-driven test fails on any table with a publish status lacking one — this is how `circuits` was caught during this very item.
3. **Locale-blind search.** Mitigation: `i18n_text()` (D-028), with a Telugu search assertion in the tests.

## Testing strategy
pgTAP: structure, RLS universality, the version-trigger invariant, search across scripts, the four product constraints, the analytics no-`user_id` guarantee, the full publish-gate walk, `trust jsonb` shape, and the anon grant posture.

## Acceptance criteria
- [x] `supabase db reset` clean from empty across all 7 migrations.
- [x] 9 `v_published_*` views exposing aggregated `trust jsonb`.
- [x] Critical-field gate proven at every state; `anon` denied on base tables.
- [x] `db lint` clean; 119 pgTAP assertions pass.

---

# Part 3 — B-005 (Day 3): generated types + Zod schemas

- **Related requirements:** TRD-DB-001, TRD-DB-002, TRD-API-001
- **Backlog item:** B-005 · **Milestone:** M0 (D3)
- **Objective:** Give application code a typed, validated door into the schema — generated table types that can never drift, plus Zod schemas carrying the product rules the database cannot express as readable errors.

## Scope
- `packages/db/types.ts` generated by `pnpm db:types` (path is verbatim from TRD §1.4/§8.2), with `pnpm db:types:check` failing on staleness and the same check wired into CI.
- Thin aliases (`Tables<>`, `TablesInsert<>`, `Views<>`, `Enums<>`) plus named `Published*` types that point at the views, keeping the "travelers read views only" boundary visible in imports.
- Zod schemas for the five TRD Day-3 entities: places, experiences, availability_rules, journeys, journey_items — insert and update shapes, plus the jsonb sub-shapes for `opening_schedule` and `crowd_pattern`.
- Compile-time pinning of the hand-written enums to the generated ones.

## Out of scope
The `withApi` wrapper and response envelope (arrive with the first real route handler, B-007/B-018); query helpers; schemas for entities the TRD did not list for Day 3.

## Frontend/API changes
None yet — this package is consumed from B-007 onward.

## Risks
1. **Duplicated enum lists drift from the database.** Mitigation: compile-time assertions (D-032), verified to actually fail by breaking one deliberately.
2. **Generated file edited by hand, or reformatted.** Mitigation: CI staleness check; `packages/db/types.ts` added to `.prettierignore` so formatting cannot make it differ from generator output.
3. **Validation stricter than the column.** Mitigation: `z.guid()` over `z.uuid()` (D-031).

## Testing strategy
Vitest: 20 schema tests covering the critical-field shapes (`opening_schedule` exceptions must be closed XOR hours), the product rules (a FIXED item needs its anchor time; advance booking cannot be required without saying how; an availability kind must carry its matching payload), and locale-openness of `_i18n`.

## Acceptance criteria
- [x] `packages/db/types.ts` generated, current, and CI-enforced.
- [x] Zod schemas for all five entities with insert/update shapes.
- [x] Enum drift breaks `pnpm typecheck` (verified by deliberate breakage).
- [x] lint / typecheck / test / build / format all green.
