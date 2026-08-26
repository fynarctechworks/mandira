# Feature Implementation Plan — LIVE-01 Live Journey (B-022)

- **Backlog item:** B-022 · **Milestone:** M1 (Day 17)
- **Feature IDs:** LIVE-01..04 (+ ENG-04, already done)
- **Requirements:** PRD-LIVE-001..006

## 1. Requirement review

| ID | What it demands |
|---|---|
| PRD-LIVE-001 | Activates on the first journey day at day-start, **or** when the traveler taps "Start today". |
| PRD-LIVE-002 | NOW card: item, place, what to do, time guidance, practical chips, phrase shortcut, **exactly three** actions — Done / Running late / Stay longer. |
| PRD-LIVE-003 | NEXT: departure-by, travel leg with mode and duration, **Navigate** hand-off, prep reminder. LATER: compact, tier chip + time window. |
| PRD-LIVE-004 | Health pill pinned at top; travel and free-time states; end-of-day card. |
| PRD-LIVE-005 | **What / when / where in ≤5 seconds.** ≥90% task success, n≥10. |
| PRD-LIVE-006 | No calendar grid, ≤3 actions per card, timing badges on long-press. |

## 2. Repository analysis

The engine half is finished and the components exist.

| Piece | Where | State |
|---|---|---|
| `getNowNextLater` — NOW/NEXT/LATER, leave-by, travel-as-focus, free/before/complete states | `packages/journey-engine/src/live.ts` | Done (ENG-04) |
| `journey_items.status` (`planned/in_progress/done/skipped/moved`), `actual_start_at`, `actual_end_at` | `0005` | Exists + RLS |
| `journeys.status` includes `active` | `0005` | Exists |
| `NowCard` (caps at 3 actions), `HealthPill`, `TierChip` | `packages/ui` | Reusable |
| `OpenInMaps` — the Navigate hand-off | B-020 | Reusable |
| `evaluateChange` / `applyOption` — the option ladder | ENG-05 | Done, **not wired here** — see §4 |

## 3. Dependency analysis

B-020's routing and Open-in-Maps are done, which is what LIVE-003's Navigate needed. MAPS-02
tiles are still waiting on ACCT-03 and are **not** required: Navigate hands off to the
traveler's own maps app rather than rendering one.

## 4. Scope, and the one judgement call

**In:** the Live screen, "Start today", the three NOW actions, end-of-day, health pill,
Navigate, LATER list.

**The judgement call — what Done / Running late / Stay longer actually do.**

"Running late" and "Stay longer" mean the plan no longer matches reality. The tempting
implementation is to reschedule the rest of the day automatically. **That is forbidden**
(PRD Principle 6: no state-changing journey action without an explicit tap, and PRD F6
routes every plan change through a Change Card the traveler accepts).

So in this item those actions **record what happened and show the consequence** — the
health pill moves, leave-by moves, the day re-projects — without rewriting the plan.
*Offering options* to fix it is the Change Card, **B-026**, where `evaluateChange` already
waits.

This is deliberately not a stub: a traveler who taps "Running late" and sees their day go
from Comfortable to Tight has learned something true and actionable. What they cannot yet
do is tap "fix it".

**Out:** practical chips (restroom/water/cloakroom — needs facility proximity, B-020's
MAPS-02 neighbours), phrase assistance (F13, later), long-press timing badges (see §5b).

## 5. Conflicts and ambiguities

**(a) None found** between PRD, TRD and the code. PRD F8, TRD §5.1 and `live.ts` agree.

**(b) PRD-LIVE-006's "timing badges on long-press" cannot be the only affordance.**
Long-press has no keyboard or screen-reader equivalent, so a trust badge reachable *only*
that way fails WCAG 2.2 AA — and PRD F9 requires every critical timing to carry a badge
reachable in one tap. **Recommendation, and what is implemented:** the badge is a real
focusable control (tap, Enter, screen reader), which satisfies both the PRD's intent and
§12.8. Long-press is not implemented as a separate path; it would be a second way to reach
the same sheet.

**(c) PRD-LIVE-005 is a usability target, not a test.** ≥90% success at n≥10 needs ten
people. What is verifiable here is the *structural* precondition: what / when / where are
all present above the fold, in that order, with no calendar grid. Recorded as such, not
claimed as met.

## 6. Risks

1. **A stale clock.** The engine takes `nowAt` as a parameter and has no clock (D-005); the
   page is server-rendered. A Live screen that shows 9:40 when it is 10:15 is worse than no
   Live screen. *Mitigation:* the client re-projects on a timer and refreshes the server
   projection each minute.
2. **Auto-applying a change.** See §4. *Mitigation:* the actions write `actual_*` and
   `status` only; nothing reschedules.
3. **Activation surprising someone.** Auto-activation on the day is PRD-LIVE-001, but it
   must not hide the plan. *Mitigation:* Live is a screen you can leave, not a mode that
   captures the app.

## 7. Testing strategy

- **pgTAP:** a stranger cannot set status on another traveler's item.
- **Vitest:** `getNowNextLater` is already covered; add the presentation mapping.
- **Playwright:** the five states (before day / item / travel / free / complete) each
  render the right card; three actions and no more; Navigate carries coordinates; no
  calendar grid; axe on the screen.

## 8. Acceptance criteria

- [x] Live activates on the day, and on "Start today".
- [x] NOW shows item, place, time guidance and exactly three actions.
- [x] NEXT shows departure-by, the travel leg, and Navigate.
- [x] LATER is compact, with tier chips and time windows.
- [x] Health pill pinned; tapping it gives causes.
- [x] Travel, free-time and end-of-day states all render.
- [x] No calendar grid, never more than three actions.
- [x] The three actions record reality and never silently reschedule.
- [x] One traveler cannot set status on another's item.

## 9. Verification note (step 9)

| Criterion | How checked |
|---|---|
| Activation | E2E: the screen renders and lists the day BEFORE "Start today" is tapped (PRD-LIVE-001's read-time half), and the button disappears once tapped. |
| Three actions, exactly | The NOW card caps at three by construction, and E2E counts the buttons in the card's region. Actions render only on a real item — offering "Done" on a travel leg would be offering to complete something that is not a task. |
| **Never reschedules** | The assertion that matters, and it hits the API directly: after `action: "done"`, every returned `planned_start_at` is compared byte-for-byte against its value before. A future "helpful" reschedule fails loudly rather than shipping. |
| Departure-by + Navigate | E2E asserts "Leave by" and the Open-in-Maps hand-off, which reuses B-020's component — no tiles, no key. |
| Health pinned, no score | Pill visible; a percentage is asserted absent anywhere on the screen (PRD F5 forbids a numeric score — a traveler has to interpret a number, and they will interpret it differently from us). |
| End of day | Renders tomorrow's first item and a link to Prepare; says so plainly on the last day instead of showing an empty card. |
| Isolation | pgTAP `0017`: a stranger sees no items, and an RLS-filtered UPDATE leaves `status` and `actual_end_at` untouched — asserted on the ROW, since such an UPDATE reports success and changes nothing. Also pins the `status` CHECK, so a route typo cannot write a status nothing recognises. |
| **The clock** | Read in the PAGE and nowhere below, so D-005's no-clock rule holds all the way down. The client re-derives countdowns each second from instants the server sent and refreshes the projection each minute — which card is NOW is the engine's answer, not the browser's. |
| Gates | lint 7/7 · typecheck 7/7 · 580 vitest · 381 pgTAP · **143 Playwright** (16 new, axe WCAG 2.2 AA clean on the Live screen) · build 2/2. |

**A note on the tests' relationship with time.** Two cases date their journey to *tomorrow*
rather than today. The fixture's experiences sit at 06:00 and 18:30, so a journey starting
today has consumed both by an evening run and correctly reads as complete — which is useless
for asserting what NEXT and LATER look like. Dating forward makes those branches deterministic
without faking the clock, which would have tested a fake.

## 10. Deferred out of this item

- **The option ladder on Late/Stay** — `evaluateChange` is built (ENG-05) and waits for the
  Change Card, **B-026**. See D-107 for why it is not wired here.
- **Practical chips** (restroom / water / cloakroom) — needs facility proximity, which needs
  MAPS-02's neighbours.
- **Phrase assistance shortcut** — F13.
- **PRD-LIVE-005's ≥90% at n≥10** — a usability target needing ten people. The structural
  precondition (what / when / where present, in order, no calendar grid) is asserted; the
  target itself is **not claimed as met**.
