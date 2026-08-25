# Feature Implementation Plan — PLAN-01..06 Journey Builder (B-019)

> **File naming note.** `docs/plans/PLAN-01.md` already exists and covers the *structured
> brief* — that was named after the backlog slice rather than the feature ID, and it is
> really INT-02 territory. This file is the plan for feature IDs **PLAN-01..06**.

- **Backlog item:** B-019 · **Milestone:** M1 (Day 14)
- **Feature IDs:** PLAN-01 (journey/day/item model + timeline), PLAN-02 (tier system + rules), PLAN-03 (item editor), PLAN-04 (traveler group), PLAN-05 (buffers), PLAN-06 (return guard)
- **Requirements:** PRD-PLAN-001, -002, -003, -004, -005, -006, -008, -009, -010

## 1. Requirement review

Restated from [REQUIREMENTS_REGISTRY](../REQUIREMENTS_REGISTRY.md) and PRD F4:

| ID | What it actually demands |
|---|---|
| PRD-PLAN-001 | A journey is days of items; six item types; a day timeline view |
| PRD-PLAN-002 | **FIXED never moved or removed. PROTECTED never removed, moved only with confirmation. IMPORTANT moved/swapped with confirmation. OPTIONAL proposed for removal first — always asked.** |
| PRD-PLAN-003 | Per item: change tier, move, set preferred window, add "after X" dependency, add a note, remove |
| PRD-PLAN-004 | Experience requirements auto-generate Prepare tasks |
| PRD-PLAN-005 | Buffers **visible and editable**; 15 min base, ×1.5, ×2 |
| PRD-PLAN-006 | Last FIXED anchored; a breach is Broken health |
| PRD-PLAN-008 | Always starts from the brief. **No "fill my day" button.** |
| PRD-PLAN-009 | 3-day/12-item journey built and retiered in ≤5 min on mobile; **health updates ≤500 ms** |
| PRD-PLAN-010 | 1–12 travelers with mobility/age_band/dietary/locale; journey prefs |

**Principle implications.** PRD Principle 6 — every state-changing action needs an explicit tap, and no journey change is ever auto-applied. That shapes the whole surface: the engine may *propose*, the traveler *decides*.

**Ambiguities found, listed rather than resolved:** see §5.

## 2. Repository analysis

Already built and reusable — nothing here needs rebuilding:

| Piece | Where | Status |
|---|---|---|
| `buildInitialJourney`, `computeHealth`, `scheduleDay`, `evaluateChange`, `applyOption` | `packages/journey-engine` | Done, 197 tests |
| `withApi` route pipeline | `@mandhira/db/api` | Done, unused so far — B-019 is its first caller |
| `KnowledgeBundle` loader | `apps/web/lib/knowledge.ts` | Done |
| Day view, health rendering, tier chips | `apps/web/components/day-plan.tsx`, `journey-health.tsx` | Done for the unsaved preview; reusable |
| `journeys`, `journey_items`, `journey_travelers`, `journey_item_dependencies`, `traveler_profiles` | `0005`, `0004` | Tables + RLS exist and are correct |
| Zod `journeyCreateSchema` / `journeyUpdateSchema` | `packages/db/src/schemas/journey.ts` | Exists |
| `ItemCard`, `TierChip`, `HealthPill`, `BottomSheet`, `ChangeCard` | `packages/ui` | Exist |
| Magic-link sign-in form | `apps/ops/app/sign-in/` | Exists **for Ops only** |

**Gap found: there is no traveler sign-in surface.** `apps/web/app/auth/callback/route.ts` can exchange a code, but nothing in the traveler app requests a magic link. A saved journey is impossible without one, so it is in scope here.

## 3. Dependency analysis

| Dependency | Status | Verdict |
|---|---|---|
| B-018 (backlog-declared) | Part 1 only | **Not needed.** B-019's dependency on B-018 is for the AI brief. The structured form (PLAN-01.md) already produces a brief without AI, and TRD §5.5 requires that path to work standalone. |
| AUTH-01..05 | IMPLEMENTED | Sufficient — the traveler-facing sign-in screen is the missing piece, built here. |
| ENG-01..05 | Done | Sufficient. |
| API-01 (`withApi`) | IMPLEMENTED | Sufficient. |
| KNOW-04, FIXTURE-01 | COMPLETE | Sufficient — content to plan against. |
| B-013 / OPEN-001 | **BLOCKED** | Affects real content only, not the builder. |

**Downstream consumers unblocked by this:** "Add to journey" (PRD-DISC-004), the two remaining discovery filters (PRD-DISC-005), Prepare (B-021), Live (B-022), offline (B-023).

## 4. Scope

**In:**
1. Traveler magic-link sign-in + sign-out.
2. `POST /api/journeys` — persist a brief-built journey (first real `withApi` caller).
3. `GET /[locale]/journeys` — the traveler's journeys.
4. `GET /[locale]/journeys/[id]` — day timeline, tier chips, health with causes, buffers shown.
5. Item actions (PLAN-03): tier change, remove, move to another day, edit buffer, note. Each an explicit tap; each re-runs the engine and returns fresh items + health.
6. Travelers UI (PLAN-04): 1–12 travelers with mobility and age band, driving buffers and physical load.
7. Reorder within a day.

**Out, with reasons:**
- **Drag-and-drop** (dnd-kit). "Move to…" covers PRD-PLAN-003's *move*; drag is an interaction upgrade, and adding a dependency plus a pointer-interaction surface belongs in its own change where it can be tested properly on touch.
- **Guest draft in Dexie** — see §5, this is a genuine docs conflict.
- **Prepare task generation (PRD-PLAN-004)** — `generatePrepareTasks` exists; the checklist screen is B-021. This plan persists nothing that B-021 would need to redo.
- **Simplify-this-day (PRD-PLAN-007)** — P1, explicitly M2.

## 5. Conflicts and ambiguities — reported, not resolved

**(a) Guest drafts: B-019 or B-023?**
TRD §11.2 Day 14 puts *"guest draft in Dexie + migrate on sign-in"* inside B-019. The backlog assigns Dexie itself to **B-023** (`OFFL-01..03`, "Dexie snapshot, cache-first reads, reconcile"), which sits four items later and depends on B-022.

Both cannot be first. My recommendation: **build B-019 for signed-in travelers now, and take guest drafts with B-023** — the Dexie schema, versioning and reconcile logic are B-023's subject matter, and building a one-off draft store here would either duplicate that or pre-empt its design. The cost is that a guest must sign in to keep a journey; the preview screen already says plainly that nothing is saved, so nothing regresses.

**Not resolved silently — say the word if you want guest drafts in this item instead.**

**(b) PRD-PLAN-009's 500 ms health budget.**
The engine runs server-side today, so every edit is a round trip and 500 ms is a network promise rather than a compute one. `apps/web/lib/engine` already has the Comlink worker client for >40 items (B-017). My recommendation: measure after the routes exist rather than architect for it blind — and record the measurement in this plan rather than asserting the criterion is met.

**(c) `traveler_profiles` and PRD-PRIV-002.**
This is the most sensitive table in the product: owner-only, with *no Ops policy at all*. PLAN-04 requires a UI over it. Everything here goes through the request-scoped client so RLS applies as the traveler, and no query joins it to anything Ops can read. Worth stating because it is the one table where a convenience join would be a privacy breach.

## 6. Risks

1. **An engine rule enforced only in the UI.** PRD-PLAN-002's tier rules must hold at the API, not just in what the screen offers — hiding a button is not a control (CLAUDE.md §4). *Mitigation:* the route refuses a forbidden change and says why; tests hit the API directly.
2. **A stale plan after an edit.** Every mutation returns fresh items **and** health, so the screen cannot show yesterday's verdict on today's plan.
3. **Silent data loss.** Removal is soft where the schema allows it, and every destructive action is an explicit tap with the consequence stated.
4. **Journeys leaking between travelers.** *Mitigation:* RLS is the control; tests assert one traveler cannot read or edit another's journey through the API.

## 7. Testing strategy (per TESTING_STRATEGY, category: API + UI + authorization)

- **pgTAP:** a second traveler cannot select or update someone else's journey or items; `traveler_profiles` stays owner-only.
- **Vitest:** the tier-rule guard as a pure function — every (tier × action) pair, including the refusals.
- **Playwright:** sign in, build from a brief, save, retier, remove an OPTIONAL item, move an item to another day, edit a buffer and watch health change, add a traveler with a mobility need and watch the physical-load cause appear. Plus axe at WCAG 2.2 AA on every new screen.
- **Verification note (step 9):** each acceptance criterion walked against the running app, recorded in §9 below before this is marked COMPLETE.

## 8. Acceptance criteria

- [x] A brief-built journey can be saved by a signed-in traveler and reopened.
- [x] FIXED cannot be moved or removed; PROTECTED cannot be removed — refused at the API, not just hidden.
- [x] Tier change, move, remove, buffer edit and note all work, each as an explicit tap.
- [x] Buffers are visible and editable (PRD-PLAN-005).
- [x] Health recomputes on every edit and shows concrete causes.
- [x] 1–12 travelers, and a mobility need changes buffers and physical load.
- [x] No "fill my day" anywhere (PRD-PLAN-008).
- [x] One traveler cannot reach another's journey.
- [x] PRD-PLAN-009's 500 ms budget: **measured** — p50 119 ms, p95 199 ms. See §9.
- [x] PRD-PLAN-006's return guard reachable from the UI — added during review, see §8b.

## 8b. Self-review findings (step 6)

Four findings. Three fixed here, one deferred with a reason.

**1 — CRITICAL, fixed. The return guard missed the case it exists for.**
`checkReturnGuard` selected the preceding item with `planned_end_at <= fixed_start_at`, which
**excludes an item running past the anchor** — the clearest possible breach. A 90-minute
darshan from 06:00 against a 06:30 train had *no* preceding item by that filter, so the guard
returned `ok` and the day read **Comfortable while the traveler missed their train**. Live
since B-016, and it survived because nothing in the product could produce a FIXED item until
this item made one reachable. The filter now selects on the item's *start*, falling back to
its end when unscheduled; two regression tests pin both directions and an E2E asserts the
sentence reaches the screen.

**2 — IMPORTANT, fixed. PRD-PLAN-006 was unreachable.** The engine implemented the return
guard and no path in the product could produce a FIXED item, so the feature was dead code
from a traveler's point of view. The brief now asks for a return, the API accepts
`fixedCommitments`, and `fixed_start_at` is persisted — without which the item stops being
FIXED on reload and the guard silently loses its anchor.

**3 — IMPORTANT, fixed. `?confirmed=false` confirmed a removal.** The DELETE schema used
`z.coerce.boolean()`, and `Boolean("false")` is `true`. Now a literal `"true"`.

**4 — MEDIUM, deferred. Journey creation is not transactional.** `POST /api/journeys` writes
journeys → destinations → traveler_profiles → journey_travelers → journey_items as separate
statements; a failure part-way leaves a journey with no items. PostgREST cannot span a
transaction, so the fix is a Postgres function — worth doing deliberately rather than tacked
on at the end of this item. **Raised as OPEN-012.**

Checklist categories 1–14 all walked. Notable non-findings: no vendor SDK outside
`packages/providers`; every tier rule stated once in the engine and asked by both the route
and the UI; generated types throughout, with the two `user!` assertions guarded by
`requireAuth: true`.

## 9. Verification note (step 9)

Each criterion walked against the running app on 2026-08-26, local stack:

| Criterion | How checked |
|---|---|
| Save and reopen | Signed in via the real magic-link flow, saved from the preview, reopened from the journeys list. |
| FIXED/PROTECTED refusals | `DELETE` sent **directly to the API**, bypassing the UI entirely → 403 with a sentence naming what the traveler said and what they could change. |
| Every item action | Tier, buffer, day-move and note exercised through both the screen and the route. |
| Buffers visible + editable | Selected 45 minutes; the timeline line re-read "45 min to get there". |
| Health on every edit | Every mutation returns `{items, health}`; asserted non-null. |
| Travelers 1–12 | 13 travelers → 400. One with `limited_walking` → ×1.5 buffers and the physical-load cause on screen. |
| No fill-my-day | Asserted absent across the builder. |
| Isolation | pgTAP `0015`: a stranger's UPDATE leaves the row byte-identical; an **admin** operator sees no traveler journeys; `traveler_profiles` unreachable by any role. |
| Return guard | 06:30 return against a 06:00–07:30 darshan → Broken, "You'd reach your return about 60 minutes late." A 20:00 return → Comfortable. |
| **PRD-PLAN-009 ≤ 500 ms** | 12 consecutive buffer edits on a 3-day journey: **p50 119 ms, p95 199 ms** (samples 112–199). Inside budget. **Caveat: localhost against a local Supabase — a floor, not a production number.** Re-measure against a deployed stack at B-025. |

## 10. Deferred out of this item

- Drag-and-drop reordering (dnd-kit) — "Move to…" satisfies PRD-PLAN-003.
- Guest drafts in Dexie — **B-023**, per §5(a).
- Prep propagation (PRD-PLAN-004) — **B-021**.
- Simplify-this-day (PRD-PLAN-007) — P1, M2.
- Transactional journey creation — **OPEN-012**.
