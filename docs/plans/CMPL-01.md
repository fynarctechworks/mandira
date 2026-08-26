# Feature Implementation Plan — CMPL-01 Complete & Reflect

- **Related requirements:** PRD-CMPL-001, PRD-CMPL-002, PRD-CMPL-003, PRD-CMPL-004
- **Backlog item:** B-036 (the CMPL half) · **Milestone:** M4
- **Objective:** Close the journey lifecycle. A traveler who has walked the days can see what actually happened, say three private things about it, mark the journey complete on their own tap, and start a similar one carrying what they said mattered. This is the last screen of the product and the one most likely to get its tone wrong.

## Scope
- The Journey Record: a per-day timeline built from Done taps, with each item's tier, when it was marked, and the traveler's own note.
- A plain statement about protected experiences — **never a score** (PRD F16).
- `POST /api/journeys/:id/complete` (TRD §5), which freezes the `summary` snapshot and moves the journey to `completed`.
- Three optional reflection questions, private, saved through `PATCH /api/journeys/:id/reflection`.
- "Plan a similar journey": pre-fills the structured brief with the tiers, pace, party size and mobility of the finished journey.
- The brief form (`/[locale]/plan`) becomes prefillable, which is what makes the above possible.

## Out of scope
- **Personalization ranking (PERS-01/02, PRD-ACCT-004)** — the second half of B-036. Ranking experiences by what a traveler has done needs more than one destination to rank across, so it waits with OPEN-001.
- Photo attachment to a reflection (M4, alongside report photos).
- Any social surface. PRD-CMPL-004 is satisfied by absence, and by an E2E asserting the absence.

## Dependencies
- LIVE-02 (Done taps) — COMPLETE. Without them the Record has nothing honest to show.
- REPT-001 (reports) — COMPLETE. The third question links to it.
- INT-001 (the structured brief) — COMPLETE. "Plan similar" hands to it.
- `journey_records` and `journey_item_notes` already exist (migration 0005). **No migration needed.**

## Existing functionality affected
- `lib/journeys.ts` `getJourney` is reused verbatim; the Record is a projection over it, not a second read path.
- `app/[locale]/journeys/[id]/page.tsx` gains one link.
- `app/[locale]/plan/page.tsx` gains defaults from the query string. Additive: with no query it behaves exactly as before, which the existing plan E2E already asserts.

## Database changes
**None.** `journey_records` (`summary jsonb`, `reflection_answers jsonb`) has existed since 0005 with an owner-only `for all` policy and no Ops policy at all. The TRD §4.6 key names are adopted verbatim rather than invented — see Risks.

## Backend/API changes
| Route | Method | Rate-limit scope | Notes |
|---|---|---|---|
| `/api/journeys/:id/complete` | POST | `journeys_write` | TRD §5, verbatim. Freezes `summary`, sets status `completed`. |
| `/api/journeys/:id/reflection` | PATCH | `journeys_write` | 2000 chars per answer; empty values stripped rather than stored. |
| `/api/journeys/:id/similar` | GET | `journeys_write` | Returns the brief. Creates nothing. Destination as **slug**, because the brief lives in the URL (D-089/D-093). |

All three are `withApi` callers; RLS decides, and a journey the caller does not own is a 404 rather than a 403 — confirming it exists is itself a leak.

## Frontend changes
- `app/[locale]/journeys/[id]/record/page.tsx` — server component; the empty case is a journey with no items, which renders the header and the reflection and nothing else.
- `components/reflection.tsx` — client; idle / saving / saved / problem.
- `components/complete-journey.tsx` — client; offered only once the last day is behind them, and only until taken.
- `components/plan-similar.tsx` — client; navigates, never saves.
- `lib/reflection.ts` — a leaf module holding the questions, so the client form does not drag `next/headers` into the browser bundle.

## Permission changes
None added, and that is the point. `journey_records` has **no Ops policy**, so the strongest role in the system cannot read a reflection. Asserted in `0023_journey_record_test.sql` against `admin`, against a stranger, and against `anon` (which has no grant on the table at all).

## Integration changes
None. Nothing here calls a provider, and nothing here is sent to a model.

## Files expected to change
`apps/web/lib/record.ts`, `apps/web/lib/reflection.ts`, `apps/web/app/[locale]/journeys/[id]/record/page.tsx`, `apps/web/app/[locale]/journeys/[id]/page.tsx`, `apps/web/app/[locale]/plan/page.tsx`, `apps/web/components/{reflection,plan-similar,complete-journey}.tsx`, `apps/web/app/api/journeys/[id]/{complete,reflection,similar}/route.ts`, `supabase/tests/0023_journey_record_test.sql`, `tests/e2e/web/record.spec.ts`, `tests/e2e/web/auth.setup.ts`, `playwright.config.ts`.

## Risks
1. **The screen becomes a score.** The whole failure mode of this feature is a percentage that reads as a grade on somebody's pilgrimage. Mitigated by D-135 and by an E2E that asserts against the **rendered page** — a ratio can appear in markup without ever appearing in `lib/record.ts`.
2. **The reflection becomes feedback.** A private note about what went wrong is the field an Ops surface would most like to read. Mitigated structurally (no Ops policy) and asserted against `admin` rather than assumed.
3. **Key drift.** TRD §4.6 fixes `reflection_answers` as `{most_meaningful, do_differently, got_wrong}`, and migration 0005's column comment repeats it. Prettier names would have made this jsonb a second shape nothing could query. Adopted verbatim and pinned by a pgTAP assertion.

## Edge cases
- **A journey with nothing marked done** — the plain statement says the things that mattered are still ahead, and no item is marked as a failure.
- **A journey whose last day has passed but was never completed** — the Record reads live; completing is offered, never applied.
- **A journey completed and then edited** — the frozen `summary` wins, so the account of a finished journey does not revise itself.
- **Mid-journey** — the Record is reachable from day one, headed "How it's going", and does not offer completion.
- **A party with mixed mobility** — the similar brief carries the strictest, matching how the original collected it (D-094).
- **A journey with no destination** — `destinationSlug` is null and the caller says so rather than opening a broken form.
- **Offline** — deliberately not in the snapshot. The Record is a look back at a finished journey, not something needed at a temple gate; adding it to the Dexie bundle would be weight for a screen nobody opens without signal.

## Testing strategy
- **pgTAP `0023`** (16): owner reads and revises; stranger reads nothing and writes nothing; **admin reads nothing**; anon has no grant; the TRD key shape holds. Scoped to its own fixtures (D-082).
- **E2E `record.spec.ts`** (13): built from Done taps and not from the clock; **no percentage, no ratio, no grading vocabulary**; an undone item carries no failure language and nothing red; reflection is private, optional and persists; the report is offered, not filed; completing is a tap; plan-similar re-opens the brief with the tiers and an empty date; **no share surface**; axe at WCAG 2.2 AA.
- Runs as a **second traveler account** (D-138) so it does not spend the first one's hourly `journeys_write` budget.

## Acceptance criteria
- [x] PRD-CMPL-001 — Done-tap timeline; planned vs completed; protected completion as a plain statement with **no score**.
- [x] PRD-CMPL-002 — three optional questions; private; the third offers report creation.
- [x] PRD-CMPL-003 — copies travelers/preferences/tiers into a new brief.
- [x] PRD-CMPL-004 — share summary remains the only share surface.

## Rollback considerations
No migration, so nothing to roll back in the database. The three routes are additive and unreferenced elsewhere; removing the Record link from the journey screen makes the whole feature unreachable without touching anything else. The plan form's defaults degrade to the previous behaviour whenever the query string is absent.
