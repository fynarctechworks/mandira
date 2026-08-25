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
