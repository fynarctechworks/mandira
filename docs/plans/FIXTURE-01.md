# Feature Implementation Plan — FIXTURE-01 Local fixture destination

- **Related requirements:** TRD §11.2 (seed scripts), PRD-TRST-001, PRD-DISC-003, TESTING_STRATEGY
- **Backlog item:** infrastructure ahead of **B-013**/**B-015** · **Milestone:** M1
- **Objective:** Give the traveler app something to render, the publish gate something to gate, and E2E something stable to assert against — before OPEN-001 is answered.

## Why now
B-013 is estimated at 2–3 real days, and most of that is research and data entry that cannot start until OPEN-001 names a destination. What *can* be done now is everything around it: a seeded destination that exercises the full path from draft through trust records to a published view. When the real destination arrives, B-013 becomes mostly data entry against a path already proven to work.

It also unblocks the **B-015 discovery UI**, which was blocked on B-013 only for something to display. A fixture is not that content — but it is enough to build and test the surface, and real content later replaces it.

## Scope
- `supabase/seed/0002_fixture_destination.sql` — one invented destination with four places, three experiences, a route with stops, availability rules, transport, cached travel legs, guidance, phrases, an advisory, accessibility records and a spread of trust records.
- `supabase/tests/0014_fixture_destination_test.sql` — the fixture's own invariants.

## What this is NOT
Content. Everything in it is invented: "Devagiri" is not a real place, its timings are not real timings, and none of it has been checked against a source. Every slug is prefixed `fixture-` and every name carries `(fixture)`, so it cannot be mistaken for launch content in a database, a screenshot or a bug report. Sources point at `example.invalid`.

## The design constraint that shaped it
A fixture where everything is Verified and everything is step-free would be worse than none: a UI built against it would ship having never rendered the other states. So the fixture deliberately covers the **range**, not just the happy path:

| Case | Fixture |
|---|---|
| Confidence `high` — "Verified" | Hill Temple, T1 source, verified 10 days ago |
| Confidence `medium` — "Verified earlier" | Prasadam Hall, T3 source, verified 120 days ago |
| Confidence `low` — "Check locally" | East Gate, reviewed but never verified, 300 days stale |
| Conflicted field | Dawn Darshan's booking instructions |
| Gate holding something back | Unready Shrine — `status = 'published'`, only one of three critical fields reviewed |
| Accessibility `yes` / `partial` / unrecorded | East Gate / Hill Temple / Prasadam Hall |
| Availability: narrow vs flexible | Dawn Darshan (05:00–06:30) vs General Darshan (always during opening) |

## Consequence, handled
Seeded data is visible to every test, and three existing pgTAP assertions were counting **globally** — they passed only because the database had been empty. `0007` asserted a published-views table was entirely empty; `0011` read the reverify job's database-wide return value; `0012` counted every place with `step_free = 'yes'`. All three now scope to their own fixtures, which is the discipline they should have had from the start: a test that depends on an empty world is a test that will break for a reason unrelated to what it checks.

## Risks
1. **Mistaking it for content.** Mitigation: the naming convention, the `example.invalid` sources, and a test asserting every fixture place says `(fixture)` in its name.
2. **Tests coupling to fixture specifics.** Mitigation: `0014` pins the *range* the fixture guarantees, so a future edit that flattens it fails loudly instead of silently un-testing a badge state.
3. **Reaching production.** Seeds run only on `supabase db reset`, a local command; the script additionally no-ops when the fixture is already present.

## Testing strategy
16 assertions on the fixture's own invariants: it exists and is labelled, all three confidence states are present, a conflict exists, the unready shrine is `published` yet invisible, three of four places clear the gate, all three accessibility cases, and enough shape for the engine to schedule against. Verified end to end by reading the published views as `anon` — three places visible of four, with high/medium/low confidence and partial/yes/none accessibility.

## Acceptance criteria
- [x] A destination renders through the published views for a guest.
- [x] All three PRD F9 confidence states have something to render.
- [x] The publish gate visibly holds something back.
- [x] All three accessibility cases present, including "unrecorded".
- [x] Nothing can be mistaken for real content.
- [x] The existing suites still pass — 333 pgTAP, 465 vitest, 35 Playwright.
