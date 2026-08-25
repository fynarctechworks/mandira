# Feature Implementation Plan — ENG-01 Journey Engine (part 1)

- **Related requirements:** TRD-ENG-001, TRD-ENG-002, PRD-PLAN-005, PRD-PLAN-006
- **Backlog item:** B-016 · **Milestone:** M1 (Day 11)
- **Objective:** The scheduling core — when things can happen, how long to leave between them, where they land on the clock, and whether the journey home still works.

## Scope
- `KnowledgeBundle` and the engine's own type vocabulary (D-005: one type, shared with the Dexie snapshot).
- `resolveAvailability` — every `availability_kind_enum` kind, priority stacking, opening-hours fallback.
- `computeBuffer` — PRD-PLAN-005 multipliers.
- `scheduleDay` — FIXED anchors, dependencies, availability, preferred windows, travel legs, buffers.
- `checkReturnGuard` — PRD-PLAN-006.
- Time helpers that are timezone- and DST-correct.

## Out of scope
- `computeHealth`, `buildInitialJourney`, `generatePrepareTasks`, the Web Worker → **B-017**.
- `evaluateChange` / `applyOption` (the option ladder) → **B-026**, M2.
- `getNowNextLater` → **B-022**.

## Dependencies
None beyond B-005's types for the contract test. The engine needs no content and no running database — which is why it was buildable while B-013 is blocked on OPEN-001.

## Risks
1. **Silent scheduling errors.** A wrong schedule looks exactly like a right one until a traveler misses something. Mitigation: PRD Appendix A is encoded as a test and acts as the oracle; a 90% coverage gate runs in CI.
2. **Timezone drift.** Realised during build: `toInstant` wrote the UTC wall time with a local offset, denoting a different moment — a 06:00 start became 00:30. Mitigation: explicit round-trip and DST tests.
3. **Inventing data the engine does not have.** Mitigation: no distance-based travel guesses; a missing duration produces a warning, not an estimate.

## Testing strategy
71 engine tests: every availability kind and its edge cases, buffer multipliers including the group rule, scheduling order and constraints, the Appendix A worked example end to end, return-guard breaches, and the awkward-input set (malformed windows, absent durations, mode-mismatched estimates). Plus compile-time contract assertions against the generated database enums.

## Acceptance criteria
- [x] All four functions implemented against TRD §5.1 signatures.
- [x] PRD Appendix A reproduces: 23-minute buffers, 420 item minutes, 97 travel minutes, aarti at 18:30 inside the day window.
- [x] ≥90% coverage, gated in CI.
- [x] Zero imports from apps, providers or Supabase in engine source.
