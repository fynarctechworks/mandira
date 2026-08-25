# Feature Implementation Plan — ENG-05 Adaptive replanning (option ladder)

- **Related requirements:** PRD-ADPT-001..006, PRD-PLAN-007, TRD-ENG-002
- **Backlog item:** B-026 (engine half) · **Milestone:** M2
- **Objective:** When something changes, work out what it costs and offer the traveler explicit ways through it — never rewrite their plan.

## Why now
Every M1 item after B-017 chains through B-013, which waits on OPEN-001. The engine half of B-026 needs no content, no database and no UI, so it was buildable while that decision is outstanding. The Change Card sheet, `journey_change_events` and the trigger wiring stay in B-026's UI half.

## Scope
- `evaluateChange` — apply the trigger, re-run health, classify the outcome, walk PRD F6's ladder, rank, return a `ChangeCard`.
- `applyOption` — apply a chosen option's changes to items.
- The `ChangeTrigger` vocabulary, matching `change_trigger_enum` verbatim.

## Out of scope
- The Change Card sheet (A13), `journey_change_events`, item-status deltas feeding triggers, push notifications → the rest of **B-026** and **B-027**.
- Offline replanning → **B-033**, which reuses this unchanged: the engine already has no network and no clock.
- "Simplify this day" (PRD-PLAN-007) → the same ladder, invoked without a trigger; wired with the builder UI.

## Decisions taken during build
- **D-065** — a buffer the traveler set wins over the computed default in `scheduleDay`.
- **D-066** — every `ItemChange` is an absolute target, never a delta.
- **D-067** — generation stops at the first ladder rung that reaches Tight or better, and any option that does not improve on "keep as is" is dropped.

## Risks
1. **Proposing something the traveler said was untouchable.** Mitigation: FIXED is never moved or removed and PROTECTED is never removed, asserted across all ten trigger kinds rather than at one representative one — the failure would be a betrayal of the tier model, not a bug.
2. **An option the card promised and the apply does not deliver.** Realised during build: the first draft expressed a PROTECTED move as a delta and evaluated it against pre-modified items, so `applyOption` on the original items would have done nothing. Mitigation: D-066, plus an idempotence test and one asserting the applied result matches what the option claimed.
3. **Offering removals that were never necessary.** Mitigation: D-067 — the ladder stops, so a removal only ever appears when nothing gentler worked.
4. **English leaking in.** Options carry `labelKey` + `becauseKey` + params, like health causes; a test asserts the key shape.

## Testing strategy
45 tests. Each ladder rung reached in isolation, including (c) failing to find a feasible day; the hard constraints across the full trigger × tier matrix (10 triggers × the four tiers); outcome classification including a breached return outranking everything; trust exposure shown for external triggers and not for the traveler's own; and `applyOption` for every operation, idempotence, non-mutation, and agreement with the option's own promise.

## Acceptance criteria
- [x] Every trigger that breaks health produces ≥1 option restoring Tight-or-better where one exists.
- [x] No option ever removes a PROTECTED or FIXED item, or moves a FIXED one.
- [x] Moving a PROTECTED item is confined to its availability and flagged for confirmation.
- [x] `no_impact` returns no options at all, so the UI can show a toast rather than a card.
- [x] "Keep as is" always states the resulting state.
- [x] Engine coverage 99.7% statements / 92.4% branches, above the 90% gate.
