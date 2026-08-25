# Feature Implementation Plan — PLAT-02 Design system (base components)

- **Related requirements:** PRD-DSGN-003 (component library), PRD-DSGN-004 (motion), PRD-DSGN-006 (accessibility); builds on PRD-DSGN-001/002 delivered in B-001
- **Backlog item:** B-002  ·  **Milestone:** M0 (Day 1)
- **Objective:** Give every later feature a tokened, accessible component vocabulary so screens are assembled rather than invented, and so the PRD §12.5 specs (sizes, states, section order, icon+text rules) are enforced in one place instead of re-litigated per screen.

## Scope
- shadcn/ui foundation in `packages/ui`: `cn()` helper, Radix primitives, `class-variance-authority` variants.
- Motion tokens (PRD §12.6: 150/250/400 ms, `cubic-bezier(0.2,0,0,1)`, reduce-motion → instant) and a focus-ring utility (§12.8: 2 px `brand.primary`).
- Components from PRD §12.5, presentational only — props are plain data, no DB or engine types:
  - `Button` (primary 48 px / secondary 48 px 1.5 px border / tertiary 44 px tap area; `loading` swaps label for spinner)
  - `TierChip` (24 px; FIXED/PROTECTED/IMPORTANT/OPTIONAL; icon + label; tappable → tier picker)
  - `TrustBadge` (20 px; Verified / Verified earlier / Check locally; icon + word) and `TrustSheet` (source, last confirmed, valid until, conflict note, Report a change)
  - `HealthPill` (32 px; Comfortable/Tight/At Risk/Broken; status colour at 12% fill; icon + state word; 250 ms crossfade)
  - `BottomSheet` (vaul; 24 px top radius, drag handle, max 90% height)
  - `ChecklistRow` (44 px, 24 px checkbox, "Why?" expander)
  - `OfflineBanner` (36 px, `status.info` 12% fill, icon + text)
  - `ItemCard` (left time rail, title, place, duration, tier chip, travel-leg connector)
  - `NowCard` (raised, 24 px padding, title 22/600, ≤3 actions)
  - `ChangeCard` (sections in fixed order: What changed / Why / Recommended / Options / Keep as is; Recommended filled `brand.primary.soft`)
  - `SourcesFooter` ("Sources & freshness", `bg.surface`, caption text, source list + oldest verification date)
- Both shell pages updated to consume real components instead of ad-hoc markup.

## Out of scope
- **Ops data table** and **Ops side-by-side review** (PRD §12.5 rows 14–15): the backlog assigns Ops tables to **B-008** and the review/diff surface to **B-012**; both need real column definitions and `@tanstack/react-table` wiring to be more than a shell. PLAT-02 therefore stays `IN_PROGRESS` after B-002.
- Wiring any component to data, engine output, or routes (B-015 onward). `ChangeCard` ships as a presentational contract; engine wiring is B-026.
- i18n externalisation of the demo strings (B-014/B-034 own the string pipeline); components take text as props, so no strings are hardcoded inside them.

## Dependencies
PLAT-01 (COMPLETE). No data or provider prerequisites.

## Existing functionality affected
`packages/ui` (tokens/fonts from B-001 — additive only), and the two shell pages from B-001, which get rewritten to use the new components.

## Database changes
None.

## Backend/API changes
None.

## Frontend changes
New `packages/ui/src/components/*`; `packages/ui/src/lib/cn.ts`; motion + focus tokens appended to `tokens.css` and mapped in the Tailwind preset. Components are leaf-level `"use client"` only where they hold state (BottomSheet, ChecklistRow, TrustSheet, TierChip picker); the rest stay server-renderable.

## Permission changes
None.

## Integration changes
None.

## New dependencies (plan-level decision, CLAUDE.md §4)
| Package | Why | TRD §3 basis |
|---|---|---|
| `lucide-react` | icon set for every icon+text status | named in §3 |
| `vaul` | bottom sheets (Change Card, item editor) | named in §3 |
| `@radix-ui/react-slot`, `-checkbox`, `-dialog` | shadcn primitives behind Button/ChecklistRow/TrustSheet | §3 "shadcn/ui (Radix primitives)" |
| `class-variance-authority`, `clsx`, `tailwind-merge` | shadcn's standard variant/class plumbing | implied by shadcn/ui |
| `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` (dev) | render-level tests for a11y-critical behaviour (icon+text present, tap-target sizes, aria wiring) — not derivable from class-string assertions | extends §3 `vitest`; **new, flagged here** |

## Files expected to change
`packages/ui/package.json`, `packages/ui/src/lib/cn.ts`, `packages/ui/src/components/*.tsx` (+ `*.test.tsx`), `packages/ui/src/tokens.css`, `packages/ui/src/index.ts`, `packages/config/tailwind/preset.css`, `vitest.config.ts` (jsdom env for component tests), `apps/web/app/page.tsx`, `apps/ops/app/page.tsx`, `docs/PROJECT_STATUS.md`, `docs/REQUIREMENTS_REGISTRY.md`.

## Risks
1. **OPEN-008 unresolved** — TierChip/HealthPill/TrustBadge render the sub-AA light-mode pairs. Mitigation: components reference tokens semantically (`bg-tier-protected-fill`), never hex literals, so resolving OPEN-008 is a token-value edit with **zero component rework**; the pinned axe exception stays cited until then.
2. Over-building ahead of data. Mitigation: presentational props only; anything needing engine/DB shape is deferred to its own backlog item.
3. `packages/ui` becoming a client-component monolith. Mitigation: `"use client"` only on the four stateful components.

## Edge cases
Reduce-motion (all transitions instant); 200% text scale (no fixed heights that clip — min-height + padding); long labels wrapping in chips/pills; `ChecklistRow` expander keyboard-operable; sheet focus trap + restore; RTL not required (en/te/hi are all LTR); every status conveyed by icon **and** word, never colour alone.

## Testing strategy
Vitest + Testing Library per component: renders icon **and** word for every status/tier state; tap targets meet the PRD size floor; `Button loading` hides the label and exposes a busy state; `ChangeCard` renders its five sections in the fixed PRD order and always offers "Keep as is"; `BottomSheet`/`TrustSheet` wire aria + focus. Existing token-contract test stays. Playwright axe smoke re-run against the rebuilt shells.

## Acceptance criteria
- [ ] Every PRD §12.5 component in scope exists in `packages/ui`, tokened, with no hex literals.
- [ ] Each status/tier/health state renders icon + text (PRD-DSGN-006).
- [ ] Motion tokens applied and reduce-motion honoured (PRD-DSGN-004).
- [ ] Both shells render using the components; `lint`/`typecheck`/`test`/`build` and the axe smoke all pass.

## Rollback considerations
Additive package; nothing deployed. Revert the commit — B-001 shells are self-contained and would need restoring with it.
