# Feature Implementation Plan — OPS-EDIT-03…06 Experiences, routes, transport, accessibility, guidance

- **Related requirements:** PRD-KNOW-001, PRD-KNOW-004, PRD-OPS-CNT-001
- **Backlog item:** B-010 · **Milestone:** M1 (Day 6)
- **Objective:** Complete the knowledge editors — the things a traveler actually does (experiences and their availability), how they move between them (routes, transport), whether they can (accessibility), and what they should know (guidance).

## Scope
- **O04 Experiences** — list + editor anchored to exactly one place or route, with booking, eligibility, queue and preparation fields, plus the **availability rule builder** covering every `availability_kind_enum` kind.
- **O05 Routes & transport** — routes with drag-ordered stops (`route_places` via dnd-kit), and transport connections between places/destinations.
- **O06 Accessibility** — `accessibility_records` attached to a place or a route.
- **O07 Guidance blocks** — typed guidance attached to a destination, place or experience.

## Out of scope
- **Trust panel and sources registry** — TRD Day 6 groups them here, but the backlog assigns both to **B-011**; following the backlog keeps the ordering the dependency map assumes.
- Publishing (B-012). No editor writes `status`.
- Media (B-012), translations workspace (M4).

## Dependencies
B-009 (COMPLETE) for `opsAction`, `I18nFields`, `LocationPicker` and the table pattern. Zod schemas for experiences and availability already exist from B-005 and are reused rather than redefined.

## Database changes
None. Every table involved exists from B-004.

## Frontend changes
New route groups under `(ops)`: `experiences`, `routes`, `transport`, `guidance`, plus accessibility editing on a place/route. Each editor follows the B-009 pattern: server component reads, client form posts through a Server Action, inline field errors.

## Permission changes
None new — same researcher/editor/approver/admin split as B-009, enforced in `opsAction` and again by RLS.

## Risks
1. **Availability rules are entirely critical fields** — a wrong rule silently produces a wrong plan. Mitigation: reuse `availabilityRuleInsertSchema`, which already refuses a kind without its matching payload, and show each kind's fields only when that kind is selected.
2. **Anchor ambiguity on experiences** (place XOR route). Mitigation: one anchor control, not two nullable pickers, so the invalid state is unreachable in the UI as well as rejected by the DB.
3. Drag ordering losing its order on save. Mitigation: explicit `sort_order` written from array index, with an E2E that reorders and reads back.

## Edge cases
An experience whose route has no stops; an availability rule spanning a year boundary; a transport connection between two destinations rather than places; guidance attached to an entity that is later archived; a place with an accessibility record and no coordinates.

## Testing strategy
Vitest for the availability payload rules (already covered in B-005) plus any new pure helpers. Playwright against the real database: create an experience with a `daily_fixed_times` rule and read it back; reorder route stops and confirm the order persists; axe on each new editor.

## Acceptance criteria
- [ ] Experience editor writes and reads back, including at least one availability rule of each shape exercised.
- [ ] Route stops reorder and persist.
- [ ] Transport, accessibility and guidance editors create and edit.
- [ ] Nav entries O04–O07 live; axe clean; full gate green.
