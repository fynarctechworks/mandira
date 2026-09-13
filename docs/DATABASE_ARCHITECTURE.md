# Database Architecture

**The schema is TRD §4 — exact table, column, enum, and view names are normative.** This file adds operating rules.

## Rules
1. Single source of truth: `supabase/migrations/*.sql`. Never edit schema in the dashboard. `supabase db reset` must always succeed.
2. Migrations apply in filename order (`0001_enums` onwards; the directory listing is the order). Each ships with a pgTAP file in `supabase/tests/` that fails without it.
3. Forward-only, additive (TRD-DB-006). Column removal = two releases (stop-write, then drop).
4. After every migration: `supabase gen types typescript --local > packages/db/types.ts` (script `pnpm db:types`); commit together.
5. Triggers required: `set_updated_at` on all tables; `entity_versions` insert on knowledge tables; `<table>_audit` (`audit_ops_change`, 0029) on every Ops-written table; `<table>_guard_publish` on every publishable table so only `publish_entity_as` sets `published`. The report auto-downgrade is applied by the `recompute_freshness` job, not a trigger.
6. pg_cron jobs live in a dedicated migration; schedules per TRD §5.4.
7. Views `v_published_*` are the traveler contract: filter published+deleted_at-null+trust-gate, aggregate `trust jsonb`. Changing a view shape = breaking client change → DECISION_LOG entry + Dexie version bump.
8. Indexing baseline: FKs indexed; GiST on `location`/`centre`; GIN on `search_tsv`; `(journey_id, day_index, sort_order)` on journey_items; ivfflat on `embedding` when pgvector activates (M3).
9. Seeds: `supabase/seed/` provides a full fixture destination for local dev and engine tests — same shape as Day-8 content, never shipped to prod.
10. Data classification: traveler_profiles/user_reports/notifications = sensitive (RLS owner or restricted roles; excluded from dumps shared outside prod); analytics_events = anonymous by schema (no user_id column exists).
11. Grants are explicit, never inherited (0030, D-153). Default privileges give `anon` and `authenticated` nothing, so a new table or function is unreachable by clients until a migration grants it — and pgTAP `0031` fails if anon's table or definer-function surface grows. `service_role` holds no grant on `traveler_profiles` or `audit_ip_salts`.
12. A SECURITY DEFINER function reachable by a client checks its caller itself and pins `search_path`; one that reads knowledge for travelers answers only for published entities (`request_is_client()`, `entity_is_published()`, D-154).
