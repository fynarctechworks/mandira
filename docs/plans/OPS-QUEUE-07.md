# Feature Implementation Plan — OPS-QUEUE-07 Impact before publish, and knowledge changes reaching journeys

- **Related requirements:** PRD-OPS-WF-007 · supports PRD-ADPT-001 (`knowledge_update` trigger)
- **Backlog item:** B-030 (first part) · **Milestone:** M3
- **Objective:** Close the loop from Ops to traveler. An approver about to publish a change sees how many live journeys it touches and the exact words those travelers will read; and publishing actually reaches them, as a Change Card they can accept or decline — not as a silent edit under their plan.

## Why this is the part of B-030 to build first

`knowledge_update` has been in `change_trigger_enum` since `0001` and nothing has ever raised it. So today an operator can correct a temple's evening timing, publish it, and **every traveler with that item in tomorrow's plan keeps the old time**. The knowledge is right and the journeys are wrong, which is worse than either alone.

## The privacy constraint that shapes the whole design

CLAUDE.md §5 and AUTHORIZATION_MODEL are absolute: *no code path may join `traveler_profiles` into Ops queries*, and `traveler_profiles` has **no Ops policy at all**. But building a Change Card needs the travelers (mobility drives buffers and the physical-load check).

So Ops cannot evaluate a card on a traveler's behalf, and must not try. Instead:

> **Ops records that published knowledge changed. The traveler's own session evaluates what it means for their journey.**

Ops writes a fact about *public* knowledge — an entity was republished. The traveler's next load notices it, and `evaluateTrigger` runs where it already runs: with their session, their RLS, their profiles. Nothing about a person crosses into Ops, and the count an approver sees is an aggregate produced by a `security definer` function that returns a number and nothing else.

## Scope
- `knowledge_updates` — an append-only log of "this published entity changed, at this time".
- `publish_entity()` records a row on every publish.
- `affected_journey_count(entity_table, entity_id)` — `security definer`, returns counts only.
- **Impact panel on the publish screen**: how many active/upcoming journeys touch this, and the wording those travelers will see — shown **before** the publish button, not after.
- **Traveler side**: on journey load, an unseen knowledge update touching one of your items raises a `knowledge_update` trigger through the existing B-026 path.
- `journeys.knowledge_checked_at` so the same update is not raised twice.

## Out of scope (the rest of B-030)
- **Conflicts** (PRD-OPS-SRC-005 / OPS-WF-003) — see the note below; auto-detection has a genuine dependency.
- **Freshness monitor** (PRD-OPS-WF-006) — next unit; all its data already exists.
- Scheduled publishing. PRD F18 mentions "scheduled or immediate"; immediate is what exists and what this touches.

### A finding about conflict auto-detection, recorded rather than worked around
PRD-OPS-SRC-005 wants a Conflict opened "when two sources of tier ≤T3 yield different values for the same field". `conflicts.values` is `{source_id, tier, value, captured_at}` per TRD §4.3 — so detection needs **per-source claimed values**. `trust_records` is `unique (entity_table, entity_id, field_name)`: it records the *one* source a field is currently verified against, never a second source's competing claim. Nothing in the schema can hold "source B says 18:00" while source A's record says 18:30.

The only producer of per-source claims is AI extraction (`ai_extractions.proposed_entities`), which is blocked on **ACCT-04**. So automatic conflict detection is genuinely blocked, not merely unbuilt. **Recommendation:** build the Conflicts queue and its resolution (PRD-OPS-WF-003) with a *manual* raise — which is what a verifier does today when they read two sources — and wire auto-detection to extraction when the key lands. Raised as **OPEN-014** for the founder rather than resolved silently (D-145).

## Dependencies
- B-026 (`evaluateChange`, `journey_change_events`, the Change Card sheet) — COMPLETE.
- B-012 (`publish_entity`) — COMPLETE.
- `change_trigger_enum` already carries `knowledge_update`.

## Database changes
`supabase/migrations/0026_knowledge_impact.sql`, additive only:
- `knowledge_updates` (`entity_table`, `entity_id`, `destination_id`, `changed_fields jsonb`, `published_at`, `published_by`). Readable by any signed-in traveler: it names published knowledge and nothing else. Written only by `publish_entity`.
- `journeys.knowledge_checked_at timestamptz` — nullable, so an existing journey sees only updates from now on rather than a backlog of every past publish.
- `affected_journey_count(text, uuid)` — `security definer`, returns `{active, upcoming, first_date}`. **No identities, no items, no profiles.**
- `publish_entity()` gains the `knowledge_updates` insert. Same function, one more statement.

## Frontend changes
- **Ops** `/publish` and each entity's publish panel: an Impact section above the button — the count, and the exact sentence the traveler will read. Empty case says plainly that no live journey includes this yet.
- **Traveler**: `lib/knowledge-updates.ts` finds unseen updates touching the journey's items and raises the trigger; the existing Change Card sheet renders it. No new screen.

## Permission changes
None. `affected_journey_count` is `security definer` and returns aggregates; `knowledge_updates` is world-readable to signed-in users because it describes published knowledge. The traveler-side evaluation runs as the traveler, under existing RLS.

## Risks
1. **A knowledge change silently editing a plan.** Would violate PRD Principle 6 outright. Mitigated structurally: Ops writes a *log row*, never a journey; the traveler's session produces a Change Card they must accept.
2. **Card storms.** One publish touching a busy destination could raise a card on every journey. Mitigated by only raising for entities the journey actually contains, only for future days, and once per update per journey (`knowledge_checked_at`).
3. **Privacy leak through the count.** A count of 1 on a rare entity is close to identifying. Mitigated by returning counts only, never dates per journey or any identifier, and by the count being visible only to `approver`/`admin`.

## Edge cases
- Publishing something no journey contains → count zero, said plainly.
- A journey already past → not counted, not triggered. A change to yesterday is not news.
- A journey with no destination → nothing matches.
- An update while the traveler is offline → seen on the next load; `knowledge_checked_at` only advances when it is actually evaluated.
- The same entity published twice before a traveler looks → both are unseen; one trigger, because the card describes the current state, not the history.

## Testing strategy
- **pgTAP**: `publish_entity` writes exactly one `knowledge_updates` row; `affected_journey_count` returns counts and is unreadable as anything else; a traveler can read `knowledge_updates` but not another traveler's journeys; **an operator still cannot read `traveler_profiles` or `journey_items`**.
- **vitest**: which updates count as unseen, and that only future days matter.
- **E2E**: publishing in Ops, then a traveler with that item seeing a Change Card — and their plan being **unchanged** until they tap.

## Acceptance criteria
- [x] PRD-OPS-WF-007 — affected active/upcoming journey count and the notification preview are shown before publish; publishing raises F6 triggers for those journeys.

## Changed during implementation
- **A `security definer` helper writes the announcement.** `publish_entity` runs as the approver, who has no insert on `knowledge_updates` and should not — a hand-written row would announce a change that never went through the gate. `record_knowledge_update()` is the narrow privileged step, following `record_audit`'s existing pattern.
- **`changed_fields` comes from `entity_versions`** rather than being re-derived. The versioning trigger already computes it, and a second implementation of "what changed" is a second thing that can disagree with the audit trail.

## What the tests reach, and what they do not

| Seam | Covered by |
|---|---|
| `publish_entity` writes exactly one announcement, with the destination | pgTAP `0027`, as a real approver through the real function |
| The count is aggregate-only, and the door stays narrow | pgTAP `0027` — four keys, and approver still blind to journeys/items/profiles |
| The impact panel's wording, and that no uuid or email appears in it | 2 E2E (ops) |
| The check never edits a plan | 3 E2E (web), comparing the whole serialised plan |

**Not reachable from a browser:** the full publish → card loop. Separation of duties means one session may not both edit an entity and approve it, so a browser-driven version needs two Ops accounts plus a traveler context. The announcement half is asserted in pgTAP as a real approver, and the card half in E2E; the join between them is `publish_entity`'s one `perform`, which pgTAP does exercise.

## Rollback considerations
Additive migration. Dropping `knowledge_updates` and reverting `publish_entity` to its previous body restores the old behaviour exactly; no journey data is touched by any of it.
