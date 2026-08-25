# Feature Implementation Plan — PLAN-01 The structured brief, and the journey it produces

- **Related requirements:** PRD-INT-002, PRD-PLAN-001/002/005, PRD-HLTH-001..005, TRD §5.5
- **Backlog item:** the part of **B-018**/**B-019** that needs neither AI nor persistence · **Milestone:** M1
- **Objective:** Take a brief, build a journey, and say whether the days hold together — the first time the engine reaches a person.

## Why this is buildable now
PRD F3 offers two ways in: describe the journey in your own words, or **answer a few questions**. The second needs no AI, so it does not wait on B-018 or on a Gemini key. It is also the fallback TRD §5.5 requires when the AI provider is unavailable, which means it has to work on its own terms rather than as a degraded mode — building it first is the right order regardless.

## Scope
- `/[locale]/plan` — the structured brief. Destination and dates required, everything else skippable (PRD-INT-002).
- `/[locale]/plan/preview` — `buildInitialJourney` over a real `KnowledgeBundle`, rendered as a day view with Journey Health, its causes, and the engine's own warnings.
- `getKnowledgeBundle()` — the engine's input, assembled from the published views. The same type Dexie will hold in B-023 (D-005).
- `0017` — a published view over `travel_estimates`.
- Journey Health's i18n keys rendered into English in one place.

## Deliberately out of scope
- **Persistence.** See D-093 below.
- Editing, reordering, retiering, "Add to journey", Change Cards → **B-019**/**B-026**.
- The AI intent path → **B-018**, which needs a key (ACCT-04) and content (OPEN-001).

## Decisions taken during build
- **D-092** — `travel_estimates` gets a published view, gated on both endpoints.
- **D-093** — the preview saves nothing, and says so.
- **D-094** — one traveler stands for the party, carrying the strictest mobility.

## The two that matter

**Travel time was silently zero.** `travel_estimates` was Ops-only, and the engine reads it to cost the leg between two items. Without a traveler path every journey scheduled as though places were adjacent — invisibly, and looking entirely normal on screen. That is the exact class of wrongness the engine exists to prevent, and it is the same shape of gap as OPEN-009.

**Nothing is saved, and the screen says so.** `journeys` has no anon policy, and AUTHORIZATION_MODEL is explicit that a guest gets *device-local drafts only* — which is Dexie, which is B-023. Persisting a guest journey server-side keyed on a cookie would contradict that model and hand the journey to anyone holding the cookie. So the brief lives in the URL, like search (D-089), and the screen states plainly that the plan is not kept. Implying a save that is not happening is how someone loses an hour of work.

## Risks
1. **A plan that looks plausible and is wrong.** Mitigation: the tests assert the schedule is *true* — each item inside its own availability window, the aarti at 18:30 because that is when it runs. An item the engine could not place is rendered with no time at all rather than a guess.
2. **Warnings swallowed.** The engine never silently drops an item; the reason has to reach somebody, so warnings render.
3. **Health as decoration.** PRD F5 requires every non-Comfortable state to name a concrete cause. Causes render under the pill, deduplicated by sentence — the engine raises one per item, and two experiences at the same partly step-free place would otherwise say the same thing twice.
4. **English leaking into the engine.** It has not: the engine returns keys and params, and `journey-health.tsx` is the single place they become sentences. That file is what moves into the message files at B-034.

## Testing strategy
14 E2E. The form: what is required and what is skippable, that the publish gate still applies on the way *in*, and that choosing something produces a journey. The journey: items inside their availability windows, health stated in words with no numeric score, tier chips carrying the traveler's own statement, an honest empty state, a 404 for a brief with no destination, and axe at WCAG 2.2 AA on both screens.

The three physical-load rules are asserted end to end, which is the chain worth having: `accessibility_records.step_free = 'partial'` → the published view → the engine's PRD-HLTH-005 check → an i18n key → a sentence on screen → a Tight pill. And the same journey for a group that walks freely shows none of it, because a warning shown to everyone is a warning nobody reads.

## Acceptance criteria
- [x] A brief with only a destination and a date produces a journey.
- [x] Items are scheduled inside their own availability windows.
- [x] Journey Health in words, with causes, and no numeric score.
- [x] Physical load reaches the screen for the traveler it applies to, and nobody else.
- [x] Tier chips reflect what the traveler said matters.
- [x] The screen does not imply a save that is not happening.
- [ ] Saving, editing and retiering — **B-019**; guest drafts — **B-023**.
