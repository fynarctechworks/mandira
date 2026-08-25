# Project Readiness Report

Final Phase-18 consistency review of the foundation. Date: 2026-08-24.

## Validation results
1. **PRD → registry:** F1–F20, Principles, §8 boundaries, §10 privacy, §11 DoD inputs, §12 design system all mapped (95 PRD requirements). ✔
2. **TRD → registry:** §2 architecture rules, §3 stack pins, §4 schema, §5 APIs/jobs/degradation, §6 security, §7 AI, §8 deployment, §9 performance, §10 cost controls (37 TRD requirements). ✔
3. **Features ↔ requirements:** every FEATURE_INVENTORY ID lists registry rows; no orphan features; no unmapped requirements found. ✔
4. **Roadmap ↔ dependencies:** milestone order matches DEPENDENCY_MAP; no forward references (replanning after health+live; ingestion after manual ops; te/hi after string pipeline). ✔
5. **Repo structure ↔ architecture:** README tree supports monorepo boundaries, engine purity, provider isolation, migration truth. ✔
6. **CLAUDE.md:** source-of-truth order, stop-on-conflict, workflow, safety rules, DoD all present and consistent with process docs. ✔
7. **Conflicting requirements found (resolved by documenting, not silently):**
   - "1–2 week build" (original prompt template) vs full ecosystem — resolved by founder: full architecture, incremental milestones (D-018 context; TRD §1.2).
   - PRD Day-8 seed-content estimate vs realistic effort — flagged as R-002; backlog B-013 carries the honest note.
   - TRD Ops password protection mentions Vercel Pro vs $0 budget — resolved: role-gate is the control on Hobby (DEPLOYMENT_ARCHITECTURE).
   No unresolved contradictions between PRD and TRD were found.
8. **Missing architecture decisions:** none blocking M0–M1; open product decisions below. ✔
9. **Hidden dependencies surfaced:** Resend domain verification before auth works (B-007 prerequisite); published experiences required before intent grounding (B-018 after B-013); engine type shape must exist before Dexie (B-023 after B-016/17). Encoded in backlog ordering. ✔
10. **Ready for implementation:** YES for M0 upon founder approval of this foundation, with the decisions below made in parallel (none block M0; OPEN-001 blocks B-013).

## Ready
Monorepo plan · full schema spec · RLS matrix · auth approach · Ops M1 scope · engine spec incl. worked example · design tokens/copy rules · CI/deploy pipeline · testing strategy · backlog B-001…B-025 fully specified.

## Needs decision (founder)
| ID | Decision needed | Blocks | Needed by |
|---|---|---|---|
| OPEN-001 | **Launch destination #1** (and ideally #2–#3 for M3) — determines seed content, sources, transport feed, pilot recruits | B-013 onward | Before Day 5 |
| OPEN-002 | Transport live-feed provider for the launch destination (depends on OPEN-001; may be "none available → dynamic curated only") | DYN-03 (M3) | M3 start |
| OPEN-003 | Production domain purchase + name | Prod DNS only | M1 Day 20 |
| OPEN-004 | Accept Gemini for te/hi after eval fixtures run, or switch provider | Public launch (M4) | End of M2 |
| OPEN-005 | Confirm launch locales en/te/hi (assumption D-014) | LANG scope | Before M4 |
| OPEN-006 | Content sourcing agreements: which T1/T2 authorities to approach for permission vs public-data-only stance (relates R-003) | M3 ingestion scale | M2 |
| OPEN-007 | Pilot group source (≥10 planners) | M2 exit | During M1 |
| ~~OPEN-008~~ (RESOLVED 2026-08-25, D-025) | **Light-mode contrast** — PRD §12.1 asserts every text/background pair meets ≥4.5:1, but 5 light-mode pairs measure below AA (dark mode passes everywhere): `text.on.primary` #FFFFFF on `brand.primary` #FF660E = **2.93** (primary buttons + PROTECTED chip); `brand.primary` as text on `bg.surface` = **2.93**; `text.tertiary` #9A908A on `bg.surface` = **3.12** and on `bg.canvas` = **2.93**; `status.tight` #B8860B = **3.25** and `status.at_risk` #D9702B = **3.33** on `bg.surface`. Conflicts with PRD §12.8 (WCAG 2.2 AA) and the PRD-DSGN-001 acceptance text. Tokens shipped verbatim in B-001 (not silently substituted, per CLAUDE.md §2). Decision needed: new light-mode hexes, or a documented AA exception. Suggested compliant swaps if you want them: `text.tertiary` → #7E736C (4.61 on surface); `status.tight` → #8A6508 (5.32); `status.at_risk` → #A8501A (5.49); for white-on-orange either darken the fill to #C24E00 (4.79) or put `brand.ink` #2B1A10 on #FF660E (5.69). | B-002 (components), PLAT-06 axe gate | Before B-002 |

## Risks (top, from RISK_REGISTER)
R-001 solo bandwidth · R-002 content effort underestimated · R-003 licensing/ToS · R-005 Indian routing quality · R-008 RLS gaps · R-009 engine correctness · R-013 trust-model staleness.

## Recommended first development task
**B-001 (Day 1, TRD §11.2): initialise the monorepo** — pnpm+turbo workspace, `apps/web` + `apps/ops` (Next 15, TS strict, Tailwind 4), `packages/ui` with the PRD §12.1 tokens as CSS variables and fonts, ESLint/Prettier/vitest/Playwright scaffolds, GitHub Actions (lint/typecheck/test). Exit: both apps build and render a tokened shell page; CI green. Then proceed strictly down the backlog (B-002…), with OPEN-001 answered before B-013.
