# Feature Implementation Plan — ENG-04 Live Journey projection

- **Related requirements:** PRD-LIVE-001..004, TRD-ENG-002
- **Backlog item:** B-022 (engine half) · **Milestone:** M1 (Day 17)
- **Objective:** Reduce the whole plan to the three questions a traveler standing somewhere actually has: what am I doing, when do I leave, what is after that.

## Why now
Like ENG-05, this is pure and needs no content, so it was buildable while B-013 waits on OPEN-001. The A16 screen it feeds still needs B-019's builder.

## Scope
- `getNowNextLater` — NOW / NEXT / LATER, the day's health state, and leave-by.
- The `LiveKind` states PRD F8 distinguishes: an item in progress, a travel leg, free time or rest, before the day, and the day complete.

## Out of scope
- The A16 screen, Done / Running late / Stay longer actions, the end-of-day card, `start-day`, and local leave-by reminders → the rest of **B-022**, which needs B-019.
- Practical chips (restroom, water, cloakroom) and phrase assistance → they read facility and guidance knowledge, so they arrive with **B-015**/**B-035**.

## Design notes
- The return type carries only the day's own items. PRD F8 forbids a calendar grid inside Live mode, and an API that hands the UI the whole week is an invitation to build one.
- `travel` is a state of the NOW card, not an item — consistent with D-061, which keeps legs computed rather than materialised. A gap with nowhere to go is `free`, not `travel`, because "you are travelling" is wrong when nobody is going anywhere.
- Rest and free-time blocks report as `free` even while in progress: PRD F8 shows "nothing you need to do right now" for these, and calling them an item would put a job where there isn't one.
- Leave-by subtracts the travel leg **and** the next item's own buffer. A leave-by that spends the buffer arrives exactly on time with nothing in hand, which is not what "leave by" means to anyone who has stood in a queue.
- `nowAt` is a parameter. The engine has no clock (D-005), which is what lets the server, the worker and an offline phone agree.

## Risks
1. **Wrong answer at a boundary.** The moment one item ends and the next has not begun is the case a traveler is most likely to be looking at the screen. Mitigation: the gap, the exact end instant, before-day and day-complete are each tested directly.
2. **Reading times the schedule never produced.** Mitigation: the tests build their fixtures by running `scheduleDay`, so the projection reads exactly what the app would.

## Testing strategy
17 tests: NOW/NEXT/LATER at mid-item and mid-gap; tier carried into every LATER row; leave-by with and without travel; all five `LiveKind` states; an unplaced item excluded rather than shown without a time; day inferred from the instant; and the same instant always producing the same answer.

## Acceptance criteria
- [x] NOW, NEXT, LATER and the day's health state from one call.
- [x] Leave-by counts back through travel and buffer.
- [x] Travel between items is the NOW focus; rest and free time say there is nothing to do.
- [x] No clock of its own — `nowAt` is always supplied.
- [x] Engine coverage 99.7% statements / 91.6% branches, above the 90% gate.
