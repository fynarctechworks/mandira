# Feature Implementation Plan — OPS-EDIT-01/02 Destination & Place editors

- **Related requirements:** PRD-OPS-CNT-001, PRD-KNOW-001, PRD-KNOW-004, TRD-API-001
- **Backlog item:** B-009 · **Milestone:** M1 (Day 5)
- **Objective:** The first screens that write knowledge — destinations and the places inside them, including the opening-schedule builder that feeds the engine.

## Scope
- O02 destinations: list + create/edit, `_i18n` tabs per active locale, coordinate picker, editorial weight.
- O03 places: list + create/edit, type/subtype, coordinates, durations, crowd pattern, and the three CRITICAL fields grouped and labelled as what gates publication.
- `OpeningScheduleBuilder` for `places.opening_schedule`, including split hours and an explicit closed-vs-not-recorded distinction.
- `GeocodingProvider` (Nominatim) in `packages/providers`, with the policy's 1 rps limit and identifying User-Agent enforced in the adapter.
- `opsAction()` — session, role check, Zod validation, `{ok,data}｜{ok,error}` envelope (D-043).

## Out of scope
- Publishing. `status` is deliberately absent from the write schemas: moving to `published` is the approve workflow (B-012).
- Trust records on the critical fields → B-011.
- The MapLibre map (D-045) → B-020.
- Experiences, routes, guidance → B-010.

## Database changes
`0010_geo_accessors.sql` — PostgREST computed columns for coordinates (D-044). Additive; no table changes.

## Permission changes
None new. Actions require researcher/editor/admin to create, plus approver to update; RLS enforces the same underneath.

## Risks
1. **A wrong opening schedule produces a wrong plan**, not a cosmetic glitch. Mitigation: shape validated by `openingScheduleSchema`, and the builder makes closed-vs-not-recorded explicit rather than inferring.
2. **Silent geography round-trip loss** — realised, not hypothetical (D-044). Mitigation: computed columns, plus an E2E that reads the saved coordinate back.
3. Operators publishing by accident. Mitigation: no status field anywhere in these forms.

## Testing strategy
Vitest for the geocoder (mapping, User-Agent, short-query guard, unparseable rows, outage vs no-match). Playwright against the real database: create a destination, create a place with split opening hours, read both back; malformed slug and half-a-coordinate rejected inline; axe on list and both editors.

## Acceptance criteria
- [x] Destination and place create/edit write real rows and read back correctly, coordinates included.
- [x] Opening-schedule builder round-trips split hours through jsonb.
- [x] Validation failures show inline without losing entered values.
- [x] Nav entries O02/O03 live; axe clean; full gate green.
