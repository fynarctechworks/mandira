# Mandhira — Project Status

Allowed statuses: `NOT_STARTED · ANALYSIS · PLANNED · IN_PROGRESS · IMPLEMENTED · TESTING · REVIEW · COMPLETE · BLOCKED`

Update rules: one row per feature (granularity = FEATURE_INVENTORY IDs); update in the same commit as the work; a feature is COMPLETE only when its CLAUDE.md Definition of Done holds and its requirements are ticked in this file's Notes.

| Module | Feature | Requirement IDs | Status | Dependencies | Last updated | Notes |
|---|---|---|---|---|---|---|
| Foundation docs | This documentation set | — | COMPLETE | — | 2026-08-24 | Created in project-foundation task; pending founder approval |
| Platform | PLAT-01 Monorepo & tooling | TRD-ARCH-001, TRD-ARCH-006 | COMPLETE | — | 2026-08-24 | B-001 done. pnpm+turbo; apps web/ops; packages ui/db/journey-engine/providers/i18n/config; eslint/prettier/vitest/Playwright; GH Actions lint+typecheck+test+build. Plan: docs/plans/PLAT-01.md |
| Platform | PLAT-02 Design system | PRD-DSGN-001..004, PRD-DSGN-006 | IN_PROGRESS | PLAT-01 | 2026-08-25 | B-002 delivered 13 of 15 PRD §12.5 components in `packages/ui` + motion/focus tokens; 81 unit tests, axe green on both shells with **no exceptions**. OPEN-008 **resolved** (D-025): §12.1 light palette revised, all 47 pairs now AA in both modes. Plan: docs/plans/PLAT-02.md. **Remaining:** Ops data table (B-008) and Ops side-by-side review (B-012) per D-022. |
| Platform | PLAT-03 Schema | TRD-DB-001/002/004/005, TRD-ARCH-004, PRD-KNOW-001/003 | COMPLETE | PLAT-01 | 2026-08-25 | B-003+B-004 done. 7 migrations, 51 tables, 9 `v_published_*` views, RLS enabled everywhere, 119 pgTAP tests, `db lint` clean, CI-enforced. Publish gate is structural: anon has no base-table grant. Plans: docs/plans/PLAT-03.md. B-005 adds generated types (`packages/db/types.ts`, CI-checked for staleness) + Zod schemas for the five TRD Day-3 entities. RLS *policies* are B-006. |
| Platform | PLAT-04 Authorization | TRD-DB-003, PRD-PRIV-002 | COMPLETE | PLAT-03 | 2026-08-25 | B-006 done: `0008_rls_policies.sql` implements the §4.9 matrix; role helpers; 33 pgTAP role/IDOR tests (152 total). Anon surface pinned to 5 policies by an allowlist test. Route-guard layer (`withApi({roles})`) lands with B-007. **OPEN-009** raised: 5 tables carry traveler-relevant data with no view or policy. |
| Identity | AUTH-01..05 | PRD-ACCT-001/002, TRD-DB-003, PRD-OPS-WF-009 | IMPLEMENTED | PLAT-04 | 2026-08-25 | B-007 done: magic link + Google (D-009), guest-first traveler middleware, `@supabase/ssr` clients in `@mandhira/db/client/*`, profile trigger (D-036), Ops role gate, separation-of-duties trigger (D-037), local admin seed. 161 pgTAP + 5 Playwright incl. a real magic-link E2E (D-038). **Not COMPLETE:** Google OAuth is config-ready but disabled until a Google Cloud client exists; production magic links need a verified Resend domain. |
| Knowledge | KNOW-01..03 | see inventory | IN_PROGRESS | PLAT-03 | 2026-08-25 | Schema + publish gate landed in B-004 (KNOW-01 entity model, KNOW-03 gate). Ops editors that populate it → B-009..B-012. |
| Ops core | Ops shell, editors, trust | PRD-OPS-CNT-001, PRD-KNOW-001/002/004, PRD-OPS-SRC-001 | IN_PROGRESS | AUTH-05 | 2026-08-25 | B-008..B-011 done: shell, all knowledge editors, sources registry (O08) and the inline trust panel. The publish gate is now satisfiable — an entity becomes publishable once every critical field reaches human_reviewed. 125 vitest + 23 Playwright. Plans: OPS-SHELL, OPS-EDIT-01-02, OPS-EDIT-03-06, OPS-TRUST-SOURCES. Next: B-012 validation, submit/approve/publish, media. |
| Discover | DISC/SRCH-01..02/TRST | see inventory | NOT_STARTED | KNOW-03 | 2026-08-24 | |
| Intent | INT-01..03 | see inventory | NOT_STARTED | KNOW-03 | 2026-08-24 | |
| Plan | PLAN/ENG-01..04,06/HLTH/PREP-01,04/MAPS | see inventory | NOT_STARTED | ENG-01 | 2026-08-24 | |
| Live & offline core | LIVE-01..04, OFFL-01..03 | see inventory | NOT_STARTED | PLAN-01 | 2026-08-24 | |
| Adapt & engage (M2) | ADPT/NOTF/REPT-01,04/SHARE/ENG-05/PREP-02,03/PLAN-07 | see inventory | NOT_STARTED | M1 | 2026-08-24 | |
| Scale & trust (M3) | OPS-SRC-02..05/QUEUE-01,03,05..07/DYN/SRCH-03/OFFL-04,05/ADPT-04/REPT-02,05 | see inventory | NOT_STARTED | M2 | 2026-08-24 | |
| Launch polish (M4) | LANG/OPS-TRANS/CMPL/PERS/OPS-DASH/PRIV-03,04/REPT-03 | see inventory | NOT_STARTED | M3 | 2026-08-24 | |
| Growth (M5) | COLLAB/CONV/CIRC/PARTNER/NATIVE/OFFL-06 | see inventory | NOT_STARTED | M4 | 2026-08-24 | |
