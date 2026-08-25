# Feature Implementation Plan — PREP-01 / SHARE-01 Prepare checklist and Journey Summary (B-021)

> **Which item, and why.** The task arrived with `<B-0XX>` unsubstituted again. Rather than
> block a second time on the same placeholder: **B-021 is the only remaining M1 item whose
> dependency is satisfied and which needs nothing from you.** B-020 shares the same
> dependency but needs a MapTiler key (ACCT-03) and an OpenRouteService key — both
> founder-blocked. Say the word if you meant a different one.

- **Backlog item:** B-021 · **Milestone:** M1 (Day 16)
- **Feature IDs:** PREP-01 (auto checklist), PREP-04 (journey summary), SHARE-01 (read-only share)
- **Requirements:** PRD-PREP-001, PRD-PREP-004, TRD-SEC-004

## 1. Requirement review

| ID | What it demands |
|---|---|
| PRD-PREP-001 | Six groups — bookings / documents / carry / know / travelers / downloads. Deduplicated. **Each item: checkbox, trust badge where it came from knowledge, "Why?" expander.** |
| PRD-PREP-004 | A **read-only, printable** Journey Summary. One A4 per day. **Excludes traveler profiles and notes.** |
| TRD-SEC-004 | Share token: 32-byte, expiring, revocable, excludes profiles and notes. |
| PRD F7 | The Prepare tab appears once a journey is ≤30 days away, or always on demand. |

**Acceptance (PRD F7):** three advance-booking experiences produce three dated booking tasks with instructions; the printed summary fits one A4 page per day.

**Principle implications.** PRD Principle 6 again — ticking a box is the traveler's action, never inferred. And the trust rule: a Prepare task that came from knowledge carries the badge of the field it came from, because "carry photo ID" is only as good as the source that said so.

## 2. Repository analysis

Everything needed already exists. Nothing here is a new table.

| Piece | Where | State |
|---|---|---|
| `generatePrepareTasks` — all six groups, deduplicated, stable ids, due dates | `packages/journey-engine/src/prepare.ts` | Done in B-017, 11 tests |
| `prepare_tasks` table — **`group_name` check matches the engine's six groups exactly**, `trust_ref jsonb`, `due_at`, `is_done`, `source_item_id` | `0005` | Exists + RLS |
| `journey_shares` — `token`, `expires_at`, `created_by` | `0005` | Exists + RLS |
| `getJourney`, `withApi`, `TrustBadge`, `ChecklistRow` | B-019 / B-002 | Reusable |
| `scheduleNotifications` prepare-deadline drafts (7d/1d) | `packages/journey-engine/src/notify.ts` | Done in NOTF-01 |

**No "does X exist?" unknowns remain.**

## 3. Dependency analysis

| Dependency | Status | Verdict |
|---|---|---|
| B-019 | Done (this commit's predecessor) | Sufficient — a saved journey to hang tasks off. |
| PREP via PRD-PLAN-004 | Delivered here | This item *is* the prep propagation PRD-PLAN-004 refers to. |
| ENG (`generatePrepareTasks`) | Done | Sufficient. |

**One honest note on step 3.** `PROJECT_STATUS.md` shows the Plan row as `IN_PROGRESS`, but that row bundles PLAN + ENG + **PREP + MAPS** — so it cannot go COMPLETE until B-020 and B-021 themselves are done. That is a granularity artefact, not a real block. Everything B-021 actually consumes is finished.

## 4. Scope

**In:**
1. `POST /api/journeys/:id/prepare` — generate tasks from the saved journey and persist, idempotent on the engine's stable ids.
2. `PATCH /api/journeys/:id/prepare/:taskId` — tick / untick.
3. `/[locale]/journeys/[id]/prepare` — the checklist, grouped, with trust badges and a "Why?" expander.
4. `/[locale]/journeys/[id]/summary` — the printable summary, with a print stylesheet targeting one A4 per day.
5. `POST /api/journeys/:id/share` — mint a 32-byte token; `DELETE` to revoke.
6. `/[locale]/s/[token]` — the read-only shared summary.

**Out, with reasons:**
- **PRD-PREP-002 notifications** — the drafts already exist in the engine (NOTF-01); *delivering* them needs the Edge Functions from **B-027**.
- **PRD-PREP-003 booked-slot promotion** — P1, assigned to **B-028**.
- **Downloads / offline** — the group renders, but actually saving for offline is **B-023**.

## 5. Conflicts and ambiguities — reported, not resolved

**(a) The shared summary needs a service-role read, and that is the risky part.**
`journey_shares` has one policy: `owns_journey`. So a *token holder* — who is `anon` — cannot read the journey through RLS at all. A public share page therefore has to read with the service-role client, scoped by token.

That is a sanctioned use (TRD §6.1: server routes acting outside a user's permissions), but it is also the one place in this codebase where RLS is not doing the protecting. **My recommendation:** do the projection in SQL — a `share_summary(token)` SECURITY DEFINER function that returns exactly the fields the summary shows and cannot return `traveler_profiles`, `journey_item_notes`, or the owner's identity, whatever the caller asks for. A hand-written select in TypeScript would work today and would be one careless `select('*')` away from leaking, and TRD-SEC-004's exclusion list deserves better than a convention.

**(b) "One A4 per day" is an acceptance criterion I cannot fully automate.**
Playwright can assert print styles apply and can produce a PDF, but page-count depends on the renderer. **Recommendation:** assert the print stylesheet's rules (page-break per day, controls hidden, colours legible in monochrome) and record a manual PDF check in the verification note — rather than asserting a page count that would pass or fail for reasons unrelated to the code.

## 6. Risks

1. **Leaking traveler data through a public link.** The highest-severity risk in this item, and the reason for §5(a). *Mitigation:* SQL projection + pgTAP asserting a token holder cannot reach profiles or notes.
2. **A stale checklist.** Tasks are generated from journey items; editing the journey should not orphan them. *Mitigation:* regeneration is idempotent on the engine's stable ids, and a ticked box survives it (that is what the stable ids are for).
3. **A token that never expires.** *Mitigation:* `expires_at` set on mint, default 30 days per TRD §5.2, and expiry enforced in the SQL function rather than in the page.
4. **A trust badge implying more than it should.** A Prepare task inherits the badge of the *field* it came from, not the entity.

## 7. Testing strategy (category: API + UI + authorization)

- **pgTAP:** a valid token returns only the summary projection; an expired token returns nothing; a revoked token returns nothing; the function cannot return profile or note columns; another traveler cannot read or tick someone's tasks.
- **Vitest:** already covers `generatePrepareTasks`; add the persistence mapping (engine task → row) if it carries logic.
- **Playwright:** three advance-booking experiences → three dated booking tasks with instructions (the PRD's own acceptance sentence); tick survives a reload and a regeneration; share link opens signed-out; revoke makes it stop working; print stylesheet applies; axe on every new screen.

## 8. Acceptance criteria

- [x] Six groups render, deduplicated, from a saved journey.
- [x] Three advance-booking experiences → three dated booking tasks **with their how-to text**.
- [x] Each knowledge-derived task shows a trust badge and a "Why?" expander.
- [x] Ticking persists, and survives regeneration.
- [x] Summary is printable, one A4 per day — **measured**, see §9.
- [x] A share link is read-only, works signed-out, expires, and can be revoked.
- [x] **A share link exposes no traveler profile, no note, and no owner identity** — asserted in pgTAP.
- [x] One traveler cannot read or tick another's prepare tasks.

## 8b. Self-review findings (step 6)

Four findings. Three fixed here, one noted.

**1 — HIGH, fixed. The upsert the whole feature rests on could not run.**
`0020` gave `(journey_id, engine_key)` a *partial* unique index (`where engine_key is not
null`), which reads like the obvious way to exempt traveler-authored tasks. `ON CONFLICT`
cannot use a partial unique index unless every statement repeats the predicate, so opening
Prepare returned a 500 — *"there is no unique or exclusion constraint matching the ON
CONFLICT specification"*. The predicate also bought nothing: `NULLS DISTINCT` is the
default, so a plain unique index already permits many traveler-authored rows per journey.
Caught by the first E2E run rather than by review.

**2 — MEDIUM, fixed. A day could not fit on a page, which is the acceptance criterion.**
Entry requirements and dress code were rendered under *every* item. Several stops at one
temple therefore repeated "carry photo ID" four times, and a day with 8 items ran to
**3 A4 sheets**. Requirements are now stated once per **day** — still repeated across days,
because each sheet is read on its own and "see yesterday" is no use to whoever is holding
today. Same journey now prints **1 sheet per day** at any density tried (§9).

**3 — MEDIUM, fixed. The share field showed a link that would not work if copied.**
`ShareControls` computed `window.location.origin` *during render*: empty on the server,
real on the client. That is a hydration mismatch, and for a moment the field a traveler
copies from held a relative path. Moved into an effect. It survived because every share
test minted through the API — so an E2E was added that reads the link out of the actual
input and follows it.

**4 — LOW, noted. `getPrepareChecklist` computes Journey Health it does not use.**
It calls `getJourney`, which recomputes health on every read. Health is pure and cheap, and
splitting the loader for this would duplicate the item mapping — a worse trade than the
few microseconds. Recorded so the next reader knows it is deliberate.

Categories 1–14 walked. Notable non-findings: no vendor SDK outside `providers`; no
service-role client anywhere on the public path; `traveler_profiles` is read only on the
traveler's own request-scoped client, and what leaves that function is "check step-free
access", never who needs it.

**One deliberate deviation from PRD Principle 6, stated rather than buried.** Opening
Prepare writes: it upserts one row per engine task. That is not a *journey* action — it
materialises a derived checklist, changes nothing the traveler chose, and is idempotent.
Every actual state change on the screen (a tick) still requires a tap and is never
inferred. Doing it on read rather than from each mutation site means the checklist cannot
drift from the journey via a path someone forgets to hook up later.

## 9. Verification note (step 9)

Walked against the running app on 2026-08-26, local stack.

| Criterion | How checked |
|---|---|
| Six groups, deduplicated | E2E: bookings / know / carry / travelers all render from the fixture journey. "For your travelers" appears only because a wheelchair user is aboard. |
| 3 bookable → 3 dated tasks with instructions | **Engine test, in the PRD's own words.** The fixture destination has one bookable experience, and inventing two more in the seed would change what every other fixture assertion counts — so the property is proven where three can exist, and E2E proves the wiring end to end. |
| Trust badge + Why? | E2E finds the badge by its accessible name; "Why?" reveals `advance_booking_how` verbatim. A unit test pins the badge OUTSIDE the `<label>` — nested, reaching for it would tick the task. |
| Tick persists | E2E: tick → reload → still ticked. And tick → edit a buffer on the journey → back to Prepare → **still ticked**, which is what the engine's stable ids are for. |
| **One A4 per day** | **Measured with Chromium's print renderer, A4, 14 mm margins.** 1 day / 2 items → 2 pages. 1 day / **8** items → 2 pages. 3 days / 4 items each → 4 pages. In every case the day itself is exactly one sheet; the trailing page is the "If you need something" facilities section. Before finding 2, the 8-item day took 3 sheets. **Caveat: one renderer. A different print engine may paginate differently.** |
| Read-only, signed out | E2E opens the link in a context with empty storage state: the plan renders, no checkbox, no remove, and a PATCH from that context is 401. |
| Expires / revocable | pgTAP for expiry; E2E for revoke — 200, then `DELETE /share`, then **404**. Not a "this was revoked" message: naming it would confirm a journey had been there. |
| **Excludes profiles and notes** | pgTAP `0016`, asserted on the whole serialised payload rather than field by field, so a column added carelessly later still trips it. The journey carries a wheelchair user and an item note reading "Ask about Amma's wheelchair at the side gate"; neither `wheelchair`, `Amma`, `side gate` nor the owner's uuid appears. E2E repeats it against the rendered page. |
| One projection, two doors | pgTAP asserts `my_journey_summary(...) = share_summary(...)` byte for byte — the owner cannot preview something narrower than what they send. |
| Isolation | pgTAP: a stranger cannot read the journey, see that a share exists, mint a link, read the prepare tasks, or tick one (asserted on the ROW — an RLS-filtered UPDATE reports success and changes nothing). |
| Gates | lint 7/7 · typecheck 7/7 · **493 vitest** · **374 pgTAP** · **122 Playwright** (17 new, axe WCAG 2.2 AA clean on Prepare, Summary and the shared page) · build 2/2. |

## 10. Deferred out of this item

- **PRD-PREP-002 deadline notifications** — the 7d/1d drafts exist in the engine (NOTF-01) and `due_at` is now persisted for the job to scan; *delivering* them needs **B-027**'s Edge Functions.
- **PRD-PREP-003 booked-slot promotion** (P1) — **B-028**.
- **Real offline downloads** — the group renders and says what it will do; saving is **B-023**.
- **Traveler-authored tasks** — `engine_key is null` and the two `_i18n` columns are reserved for them; nothing writes one yet.
- **A "Documents" group** — the engine emits none today, so the heading never appears rather than showing an empty box.
