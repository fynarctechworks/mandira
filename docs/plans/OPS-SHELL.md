# Feature Implementation Plan — Ops core shell

- **Related requirements:** PRD-OPS-CNT-001, PRD-DSGN-003 (§12.5 rows 14–15, deferred here by D-022), PRD-DSGN-006
- **Backlog item:** B-008 · **Milestone:** M1 (Day 5)
- **Objective:** Give the Ops platform its frame — navigation over all 22 screens, a command palette to reach them, and the data table every list screen will be built from — so B-009 onward add editors rather than re-inventing chrome.

## Scope
- Ops shell inside the role-gated route group: sidebar navigation covering **all** O01–O22 screens grouped per FRONTEND_ARCHITECTURE (`dashboards`, `entities`, `sources`, `queues`, `admin`), header with the signed-in operator and sign-out.
- Navigation entries for screens that do not exist yet are **visible but disabled**, labelled with the milestone that brings them. The map of the platform is itself useful information for an operator; a nav that grows silently is not.
- Command palette (`cmdk`) over the same nav model — one source of truth, so a screen cannot appear in one and not the other.
- `OpsDataTable` in `packages/ui` (PRD §12.5 row 14): sticky header, 13/18 type, 40 px rows, inline status tags, bulk select. Built on `@tanstack/react-table`.
- Ops home (O01) showing what the operator can currently do, honestly reflecting that the queues are not built yet.

## Out of scope
- Every editor and queue screen (B-009 … B-012, and later milestones). **No placeholder screens** — a disabled nav entry is honest; an empty page pretending to be a feature is not.
- Ops side-by-side review (§12.5 row 15) → B-012, where a real diff exists to render.
- O01's knowledge-health dashboard content (F20) → M4; the route exists as the shell's landing page only.

## Dependencies
B-007 (COMPLETE) for the role gate and session. `packages/ui` tokens and components from B-002.

## Existing functionality affected
`apps/ops/app/(ops)/layout.tsx` gains the shell around the existing gate; the B-001/B-002 shell page becomes Ops home.

## Database changes
None.

## Frontend changes
`apps/ops/components/ops-nav.tsx`, `command-palette.tsx`, `app-shell.tsx`; nav model in `apps/ops/lib/nav.ts`; `packages/ui/src/components/ops-data-table.tsx`. Loading/empty/error states belong to the screens that fetch data (B-009+); the shell itself is static.

## Permission changes
None beyond B-006/B-007. The nav shows every screen regardless of role — RLS and the route guards decide what actually opens, and hiding entries would make the platform harder to reason about without adding security (UI hiding is never a control).

## New dependencies (plan-level decision, CLAUDE.md §4)
| Package | Why | TRD §3 basis |
|---|---|---|
| `cmdk` | command palette | named in §3 |
| `@tanstack/react-table` | Ops tables | named in §3 |

## Risks
1. **Nav and palette drifting apart.** Mitigation: both render from one exported model; a test asserts the palette lists every enabled screen.
2. **Building 22 empty screens.** Mitigation: explicitly out of scope; disabled entries instead.
3. **Data table built for a hypothetical use.** Mitigation: keep it a thin typed wrapper over `@tanstack/react-table` and let B-009 be the first real consumer, rather than guessing at features now.

## Edge cases
Long destination names in a 40 px row (truncate, title attribute); zero rows (explicit empty state); keyboard-only traversal of nav and palette; palette open/close focus restoration; 200% text scale on the sidebar.

## Testing strategy
Vitest for `OpsDataTable` (renders rows, selection toggles, empty state) and for the nav model (every enabled item has a real route; palette and nav agree). Playwright: shell renders for a signed-in admin, palette opens with the keyboard and navigates, axe clean on the authenticated shell.

## Acceptance criteria
- [ ] Sidebar lists all 22 screens, grouped, with unavailable ones disabled and milestone-labelled.
- [ ] Command palette opens (⌘K / Ctrl-K), filters, and navigates.
- [ ] `OpsDataTable` renders with sticky header, selection, and an empty state.
- [ ] Signed-in operator sees the shell; axe clean; lint/typecheck/test/build green.
