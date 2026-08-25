# Feature Implementation Plan — OPS-EDIT-09 / OPS-SRC-01 Trust panel & sources registry

- **Related requirements:** PRD-KNOW-002, PRD-KNOW-004, PRD-OPS-SRC-001, PRD-OPS-WF-009
- **Backlog item:** B-011 · **Milestone:** M1 (Day 6)
- **Objective:** Make the publish gate satisfiable. Until now nothing could reach travelers, because every critical field needs a trust record and there was no way to attach one.

## Scope
- **O08 Sources registry** — register, edit and retire sources with type, tier, URL, contact, re-check cadence and status. `manual` ingestion only in M1.
- **Trust panel** — inline on each critical field of a place or experience: source, verification status, valid-until, evidence URL and the exact quoted wording.
- `CRITICAL_FIELDS` in `@mandhira/db`, asserted against the SQL gate so the two cannot drift.
- Status-transition roles: a reviewer accepts (→ `human_reviewed`), a verifier confirms against a source (→ `verified`).

## Out of scope
- The Review/Verify/Approve **queues** (B-012 and M3) — this is the inline panel, not the work list.
- Conflict resolution (M3), freshness monitor (M3), re-verification scheduling.
- Publishing itself (B-012). Trust is the precondition, not the act.

## Database changes
None. `trust_records` and `sources` exist from B-003, and `freshness`/`confidence` are already derived by trigger.

## Permission changes
No new policies. The action adds a status-specific role check on top of the existing RLS write policy, because `verified` is what produces a high-confidence badge for travelers and must not be reachable by every Ops role.

## Risks
1. **The TS critical-field list drifting from the SQL gate** — silently un-gating a field. Mitigation: a test that reads `0007_published_views.sql` and compares.
2. **A panel claiming a field is cleared when it is not.** Realised during build: the badge derived from the unsaved dropdown. Now derived from saved state only.
3. Verified-without-a-source. Mitigation: schema refinement requires a source for `verified`.

## Testing strategy
Vitest: the SQL/TS critical-field sync. Playwright against the real database: register a source, create a place, watch it go from 3-of-3 blocking to publishable, then verify one field and confirm the database-derived confidence reads "high" — proving the trigger ran rather than the UI asserting it.

## Acceptance criteria
- [x] Sources can be registered, edited and retired; tier is visible in the list.
- [x] Every critical field shows whether it blocks publication, and why it matters.
- [x] An entity becomes publishable only once all critical fields reach `human_reviewed`.
- [x] Derived confidence/freshness shown, never edited.
