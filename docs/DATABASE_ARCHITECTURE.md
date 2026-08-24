# Database Architecture

**The schema is TRD §4 — exact table, column, enum, and view names are normative.** This file adds operating rules.

## Rules
1. Single source of truth: `supabase/migrations/*.sql`. Never edit schema in the dashboard. `supabase db reset` must always succeed.
2. Migration order for initial build: `0001_enums` → `0002_locales_sources_trust` → `0003_knowledge` → `0004_users` → `0005_journeys` → `0006_reports_notifications` → `0007_views` → `0008_rls` → `0009_triggers`.
3. Forward-only, additive (TRD-DB-006). Column removal = two releases (stop-write, then drop).
4. After every migration: `supabase gen types typescript --local > packages/db/types.ts` (script `pnpm db:types`); commit together.
5. Triggers required: `set_updated_at` on all tables; `entity_versions` insert on knowledge tables; `audit_log` on ops mutations; report auto-downgrade counter on `user_reports`.
6. pg_cron jobs live in a dedicated migration; schedules per TRD §5.4.
7. Views `v_published_*` are the traveler contract: filter published+deleted_at-null+trust-gate, aggregate `trust jsonb`. Changing a view shape = breaking client change → DECISION_LOG entry + Dexie version bump.
8. Indexing baseline: FKs indexed; GiST on `location`/`centre`; GIN on `search_tsv`; `(journey_id, day_index, sort_order)` on journey_items; ivfflat on `embedding` when pgvector activates (M3).
9. Seeds: `supabase/seed/` provides a full fixture destination for local dev and engine tests — same shape as Day-8 content, never shipped to prod.
10. Data classification: traveler_profiles/user_reports/notifications = sensitive (RLS owner or restricted roles; excluded from dumps shared outside prod); analytics_events = anonymous by schema (no user_id column exists).
