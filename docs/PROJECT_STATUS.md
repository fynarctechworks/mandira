# Mandhira — Project Status

Allowed statuses: `NOT_STARTED · ANALYSIS · PLANNED · IN_PROGRESS · IMPLEMENTED · TESTING · REVIEW · COMPLETE · BLOCKED`

Update rules: one row per feature (granularity = FEATURE_INVENTORY IDs); update in the same commit as the work; a feature is COMPLETE only when its CLAUDE.md Definition of Done holds and its requirements are ticked in this file's Notes.

| Module | Feature | Requirement IDs | Status | Dependencies | Last updated | Notes |
|---|---|---|---|---|---|---|
| Foundation docs | This documentation set | — | COMPLETE | — | 2026-08-24 | Created in project-foundation task; pending founder approval |
| Platform | PLAT-01 Monorepo & tooling | TRD-ARCH-001, TRD-ARCH-006 | COMPLETE | — | 2026-08-24 | B-001 done. pnpm+turbo; apps web/ops; packages ui/db/journey-engine/providers/i18n/config; eslint/prettier/vitest/Playwright; GH Actions lint+typecheck+test+build. Plan: docs/plans/PLAT-01.md |
| Platform | PLAT-02 Design system | PRD-DSGN-001, PRD-DSGN-002, PRD-DSGN-003 | IN_PROGRESS | PLAT-01 | 2026-08-24 | Tokens (§12.1 light+dark) + fonts (§12.2 next/font) + shape/elevation (§12.3) landed in B-001 and covered by a token-contract test. Remaining for B-002: shadcn base components (PRD-DSGN-003). BLOCKED-ON-DECISION: OPEN-008 light-mode contrast conflict (see readiness report) |
| Platform | PLAT-03..08 | see inventory | NOT_STARTED | PLAT-01 | 2026-08-24 | |
| Identity | AUTH-01..05 | see inventory | NOT_STARTED | PLAT-03 | 2026-08-24 | |
| Knowledge | KNOW-01..03 | see inventory | NOT_STARTED | PLAT-03 | 2026-08-24 | |
| Ops core | OPS-EDIT/MEDIA/PUB/SRC-01/QUEUE-02,04 | see inventory | NOT_STARTED | AUTH-05 | 2026-08-24 | |
| Discover | DISC/SRCH-01..02/TRST | see inventory | NOT_STARTED | KNOW-03 | 2026-08-24 | |
| Intent | INT-01..03 | see inventory | NOT_STARTED | KNOW-03 | 2026-08-24 | |
| Plan | PLAN/ENG-01..04,06/HLTH/PREP-01,04/MAPS | see inventory | NOT_STARTED | ENG-01 | 2026-08-24 | |
| Live & offline core | LIVE-01..04, OFFL-01..03 | see inventory | NOT_STARTED | PLAN-01 | 2026-08-24 | |
| Adapt & engage (M2) | ADPT/NOTF/REPT-01,04/SHARE/ENG-05/PREP-02,03/PLAN-07 | see inventory | NOT_STARTED | M1 | 2026-08-24 | |
| Scale & trust (M3) | OPS-SRC-02..05/QUEUE-01,03,05..07/DYN/SRCH-03/OFFL-04,05/ADPT-04/REPT-02,05 | see inventory | NOT_STARTED | M2 | 2026-08-24 | |
| Launch polish (M4) | LANG/OPS-TRANS/CMPL/PERS/OPS-DASH/PRIV-03,04/REPT-03 | see inventory | NOT_STARTED | M3 | 2026-08-24 | |
| Growth (M5) | COLLAB/CONV/CIRC/PARTNER/NATIVE/OFFL-06 | see inventory | NOT_STARTED | M4 | 2026-08-24 | |
