# Feature Implementation Plan — PLAT-01 Monorepo & tooling

- **Related requirements:** TRD-ARCH-001, TRD-ARCH-006, PRD-DSGN-001, PRD-DSGN-002 (tokens + fonts portion, pulled forward from B-002 by founder instruction 2026-08-24)
- **Backlog item:** B-001  ·  **Milestone:** M0 (Day 1)
- **Objective:** A buildable pnpm+turbo monorepo with both Next.js 15 apps rendering a tokened shell page, shared config, test scaffolds and green CI, so every later backlog item has a place to land.

## Scope
- pnpm workspaces + turbo (`build`, `lint`, `typecheck`, `test`).
- `apps/web` (traveler PWA, mobile-first) and `apps/ops` (Ops, desktop): Next 15 App Router, React 19, TS strict, Tailwind 4; one shell page each.
- `packages/ui`: PRD §12.1 tokens as CSS variables (light + dark), §12.2 fonts via `next/font` (Inter, Fraunces, Noto Sans Telugu, Noto Sans Devanagari), §12.3 spacing/radius/elevation tokens, Tailwind 4 `@theme` mapping.
- `packages/config`: shared eslint (flat), tsconfig, Tailwind preset CSS, prettier.
- Empty workspace stubs for `packages/db`, `journey-engine`, `providers`, `i18n` (package.json + tsconfig + index only) so the README tree exists.
- Vitest scaffold (root config; first test = token contract in `packages/ui`) and Playwright scaffold in `tests/e2e` (shell smoke + axe).
- GitHub Actions `ci.yml`: install → lint → typecheck → test → build.

## Out of scope
Database/Supabase, auth, shadcn components (B-002), PWA/Serwist (B-014), i18n routing (B-014/B-034), Sentry, any feature screen.

## Dependencies
None (first item). Node 22, pnpm 10.

## Existing functionality affected
None — repo contains docs only (searched: no `package.json`, `apps/`, `packages/`).

## Database changes
None.

## Backend/API changes
None.

## Frontend changes
One shell page per app: heading in Fraunces, body in Inter, a token swatch strip so the token wiring is visible; light/dark via `prefers-color-scheme` and `.dark` class. Static pages — no loading/empty/error states apply.

## Permission changes
None.

## Integration changes
None.

## Files expected to change
Root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.gitignore`, `.nvmrc`, `.github/workflows/ci.yml`.
`apps/web/**`, `apps/ops/**`, `packages/ui/**`, `packages/config/**`, stubs `packages/{db,journey-engine,providers,i18n}/**`, `tests/e2e/**`, `docs/PROJECT_STATUS.md`, `docs/REQUIREMENTS_REGISTRY.md`, `docs/DECISION_LOG.md`.

## Risks
1. `next/font/google` needs network at build (CI/Vercel fine; offline dev builds fail) — mitigation: fallback stacks declared; self-host later if it bites.
2. Tailwind 4 has no JS presets — mitigation: preset is a CSS file (`@theme`) imported by both apps (D-020).
3. Turbo/pnpm on Windows path quirks — mitigation: verify `pnpm build` locally on Windows before CI.

## Edge cases
Dark mode via both OS preference and explicit `.dark` class; Telugu/Devanagari glyphs render via the Noto fonts (sample string on shell page).

## Testing strategy
- Vitest: `packages/ui` token contract test (every PRD §12.1 token present in light and dark scopes).
- Playwright scaffold: shell renders + axe zero serious/critical (run locally / nightly; wired into CI once preview deploys exist — B-025).
- CI: lint, typecheck, test, build.

## Acceptance criteria
- [ ] `pnpm install && pnpm build` succeeds for both apps.
- [ ] Both apps render a shell page using tokens + fonts.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass locally and in GitHub Actions.

## Rollback considerations
Scaffold only; nothing deployed. Revert commit.
