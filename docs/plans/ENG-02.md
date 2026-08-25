# Feature Implementation Plan — ENG-02/03/06 Journey Engine (part 2)

- **Related requirements:** PRD-HLTH-001..005, PRD-PLAN-008, PRD-PREP-001, TRD-ENG-002
- **Backlog item:** B-017 · **Milestone:** M1 (Day 12)
- **Objective:** Answer "can this still realistically happen?", turn a confirmed brief into a journey, and derive the Prepare checklist from what the journey actually contains.

## Scope
- `computeHealth` — PRD F5's five checks per day, four states, causes as i18n keys + params.
- `buildInitialJourney` — brief → day-assigned, scheduled items + health.
- `generatePrepareTasks` — PRD F7 groups, deduplicated, each traceable to its source.
- Web Worker wrapper (`comlink`) above 40 items, in `apps/web/lib/engine` (D-060).

## Out of scope
- `evaluateChange` / `applyOption` (the option ladder) → **B-026**, M2.
- `getNowNextLater` → **B-022**.
- Worst-case (max-duration) preview — PRD-HLTH-004's second half; it needs the UI surface that B-019 brings.
- Rendering causes into sentences: that is `packages/i18n` plus the health sheet in B-019.

## Dependencies
B-016 only. No content, no database, no running Supabase — which is why this was buildable while B-013 sits blocked on OPEN-001.

## Decisions taken during build
- **D-059** — pace targets (relaxed 0.6, balanced 0.8, full 1.0 of the day window) for *placement only*.
- **D-060** — the worker wrapper lives in `apps/web`, not in the engine package.
- **D-061** — travel legs stay computed, not materialised as journey items.
- Physical load implements all three of PRD-HLTH-005's rules, each raised only for a traveler who has that constraint: 2,000 m for `limited_walking`, step-free access for `wheelchair`, and a 90-minute rest cadence for `needs_rest_frequently`. `step_free` keeps the `accessibility_records` vocabulary (`yes`/`no`/`partial`) and treats "not recorded" as its own answer.

## Risks
1. **A wrong health state is worse than none.** Someone reading "Comfortable" stops checking. Mitigation: PRD F5's table is encoded as `decideState` and tested at each of its boundaries (80/81, 60/61 minutes), separately from the checks that feed it.
2. **The builder quietly becoming a recommender.** PRD-PLAN-008 forbids auto-fill, and a padded journey is hard to spot after the fact. Mitigation: a test hands the builder a bundle full of tempting content the brief never names and asserts the result is empty.
3. **English leaking into the engine.** Causes are consumed offline, on a server and in a worker, none of which know the traveler's language. Mitigation: causes are keys + params, and a test asserts the key shape.
4. **Worker bundling.** `new URL("./engine.worker.ts", import.meta.url)` is unexercised until a page calls the client (B-019); typecheck and unit tests cover the routing, not the bundler output.

## Testing strategy
84 new tests (295 total). `decideState` at every boundary of the F5 table; each of the five checks in isolation and in combination; the three physical-load rules including "not recorded"; day packing under each pace, with overflow, pinned days and availability-driven day choice; determinism; the PRD F3 worked example (Tirumala, Suprabhatam, Sunday return) built end to end. The worker client is tested over a real Comlink endpoint on a `MessageChannel`, covering the threshold, worker reuse, and the fall back to the main thread when the worker cannot start.

## Acceptance criteria
- [x] All four PRD F5 states reachable, from all five checks, with concrete causes.
- [x] Causes are i18n keys + params; no rendered language in the engine.
- [x] `buildInitialJourney` adds nothing the brief does not name, and drops nothing.
- [x] `generatePrepareTasks` covers PRD F7's groups, deduplicated, with stable ids.
- [x] Engine runs in a Worker above 40 items, and still answers when it cannot.
- [x] Coverage 99.9% statements / 93.9% branches, above the 90% gate.
