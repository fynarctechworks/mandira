# Feature Implementation Plan — KNOW-04 Traveler read surface: repair and accessibility

- **Related requirements:** PRD-DISC-003, PRD-TRST-001, PRD-HLTH-005, PRD-KNOW-003, TRD-DB-005
- **Backlog item:** resolves the blocking half of **OPEN-009**, ahead of B-015 · **Milestone:** M1
- **Objective:** Make the published views actually readable by a traveler, and let them carry the accessibility a wheelchair user plans around.

## Why now
Two things converged. B-017's engine reads `place.step_free` for PRD-HLTH-005's wheelchair check, and nothing in the database could supply it — `accessibility_records` had no published view. And while wiring that up, the views turned out not to work for travelers at all.

## The bug this uncovered
Every `v_published_*` view raised `permission denied for table trust_records` for `anon` and for any signed-in traveler without an Ops role — i.e. for every traveler. The entire read surface was unusable.

**Why it hid since 0007.** A view reads its referenced *tables* with the view owner's rights, but a *function* called inside the view runs with the invoker's, and its own table access is checked against the invoker. `critical_fields_gated()` and `entity_trust()` both read `trust_records`, which 0008 correctly restricts to Ops. Per-row functions are only evaluated when there *are* rows, so all nine views test clean while empty — and every pgTAP file to date ran as `postgres`. It would have surfaced on the day B-013 seeded the first content.

`0014` makes those helpers `SECURITY DEFINER` with a pinned `search_path`. The gate itself is unchanged: an entity that failed it before fails it now.

## Scope
- **0014** — `critical_fields_gated` and `entity_trust` become definer; EXECUTE granted explicitly to `anon`/`authenticated` rather than inherited from `PUBLIC`.
- **0015** — `accessibility_for()` and `route_stops_for()`; `accessibility` on places, experiences and routes; `stops` on routes.
- **0013 test** — every published view read *with content in it*, as a guest and as a signed-in traveler.

## Out of scope, deliberately
`circuits` (M5), `destination_links` and `live_feed_readings` (B-031) stay closed. No feature reads them yet, and a surface opened before anything reads it is a surface nobody notices is open too far. **OPEN-009 is narrowed, not closed.**

## Decisions taken during build
- **D-078** — definer helpers, with the direct-call exposure accepted and stated.
- **D-079** — an experience shows the accessibility of its place, resolved through `v_published_places`.
- **D-080** — accessibility is `NULL` when unrecorded, never `{}`.

## The trade in D-078, stated plainly
EXECUTE **cannot** be revoked from the client roles — a function called inside a view is checked against the invoker, so revoking it breaks the view for exactly the people this repairs it for (verified, not assumed). So a caller who already knows the UUID of an *unpublished* entity can call `entity_trust` directly and learn its source name and verification dates.

Accepted, because the alternative — inlining both helpers into all nine views so the owner's table rights apply — would duplicate the publish gate nine times. A gate restated nine times is a gate that will eventually disagree with itself, and duplicated security logic is a likelier source of a real breach than a lookup that requires already knowing a secret id. Revisit if entity UUIDs ever become guessable or externally visible.

## Risks
1. **Opening too much.** Mitigation: the tests are mostly denials — an unpublished place must not leak through a route's stop list, an ungated place must not leak through an experience card, `traveler_profiles` must stay unreachable.
2. **A definer function is a standing hole if its `search_path` is loose.** Mitigation: `set search_path = public` on every one.
3. **View shape change.** Per CLAUDE.md §4 this needs a Dexie version bump when the snapshot lands in **B-023** — columns are appended, never inserted, so a positional read cannot silently shift.

## Testing strategy
51 new pgTAP assertions across two files. `0012` covers the feature and its denials: values through with their vocabulary intact, `NULL` for unrecorded, ungated and draft places still invisible, an experience inheriting only from a gated place, stops filtered to published places and ordered by `sort_order`, and guests/travelers refused the base tables by their two different mechanisms. `0013` is the regression file the bug needed: content first, then all nine views read as `anon` and as a signed-in traveler, with the trust payload asserted non-empty and the source tier rendered in words.

## Acceptance criteria
- [x] Every published view is readable, with content, by a guest and by a signed-in traveler.
- [x] Trust badges reach a traveler — PRD F9 is possible at all.
- [x] Accessibility on places, experiences and routes; route stops in order.
- [x] The publish gate is unchanged; unpublished and ungated entities stay invisible.
- [x] `traveler_profiles` remains unreachable from any client role.
- [ ] Dexie version bump — carried into **B-023**, where the snapshot first exists.
