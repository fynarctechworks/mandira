# Feature Implementation Plan — DISC-01 Discovery: destination page and home

- **Related requirements:** PRD-DISC-001..003, PRD-TRST-001/002, PRD-KNOW-005, TRD-API-001
- **Backlog item:** **B-015**, first slice · **Milestone:** M1
- **Objective:** Let a traveler who knows nothing about a destination find its most significant experiences, whether they run on their dates, and whether any need booking — without needing an account.

## Why this is buildable now
B-015 was blocked on B-013 only for something to display. FIXTURE-01 supplies that. The UI does not care whether the content is real, and real content later replaces the fixture without touching a line of this.

## Scope
- `apps/web/lib/knowledge.ts` — the traveler's read of the published views, with locale resolution at the boundary.
- `apps/web/lib/present.ts` — the plain-language rules PRD F2 asks for: availability, duration, booking, accessibility icons.
- Experience and place cards, the accessibility icon set, the destination page, and a home that lists real destinations.
- `tests/e2e/web/discovery.spec.ts` — 12 tests including an axe pass.

## Out of scope
- **Search and filters** (SRCH-01, PRD F2's six filters) — the next slice.
- **"Add to journey"** — needs the journey builder (**B-019**).
- **Place and experience detail pages**, the tappable trust sheet, and "See all" beyond 20 — next slice; `TrustSheet` already exists from B-002 and is not yet wired.
- **Nearby / getting-there sections** — need `transport_connections` rendering and MAPS (**B-020**).

## Decisions taken during build
- **D-083** — a card shows the WEAKEST trust state across its fields.
- **D-084** — an unrecorded accessibility field produces no icon at all, and the absence is said in words.
- **D-085** — Supabase `select()` strings must be single literals, never concatenated.

## The judgement in D-083
A card summarises several fields under one badge. Showing the best of them would let a card read "Verified" while an unshown timing says "Check locally" — technically true, practically a lie, and undetectable by the person it misleads. So the card takes the worst state, and the detail page (next slice) breaks it down. The fixture's Dawn Darshan proves it: verified by a T1 source, but its booking instructions carry a conflict, and the card correctly reads "Check locally".

## Risks
1. **Showing something unpublished.** Mitigation: every query goes through a `v_published_*` view and the base tables are closed to travelers (D-029) — the guarantee is in the database, not in this code's care. An E2E asserts the fixture's deliberately-ungated shrine never appears.
2. **A reassuring badge on unreliable information.** Mitigation: D-083, plus an E2E that all three states actually render — a surface that has only ever shown "Verified" is one where the other two have never been seen.
3. **Implying accessibility that was never checked.** Mitigation: D-084. A crossed-out wheelchair on a place nobody has checked states something false about the world.
4. **A silent locale fallback.** Mitigation: PRD-KNOW-005 — cards carry "Not yet available in your language" when they fell back to English.

## Testing strategy
12 E2E on mobile viewport, weighted towards denials: the ungated shrine never appears, an experience without a booking requirement says nothing about booking, a conflicted field pulls its card down. Plus the positives PRD F2 requires — availability in plain language, likely duration, the 60-days-notice booking line, editorial ranking, the sources footer — and an axe pass at WCAG 2.2 AA with no exceptions.

## Acceptance criteria
- [x] Home lists published destinations and links through; honest empty state when there are none.
- [x] Destination page renders PRD F2's sections in PRD F2's order, advisories first.
- [x] Every experience card carries name, significance, availability, duration, booking flag, accessibility icons and a trust badge.
- [x] All three trust states and all three accessibility cases render.
- [x] Nothing ungated or unpublished is reachable.
- [x] Guest-first — no account required anywhere.
- [ ] Search, filters, detail pages, "Add to journey" — next slices and B-019.
