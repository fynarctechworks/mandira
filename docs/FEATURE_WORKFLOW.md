# Feature Implementation Workflow

Every feature follows this lifecycle. Statuses in PROJECT_STATUS.md map: 1–3 = ANALYSIS, 4 = PLANNED, 5 = IN_PROGRESS, 6 = REVIEW, 7–8 = TESTING, 9–11 = IMPLEMENTED→COMPLETE.

| # | Step | Input | Required actions | Output | Complete when |
|---|---|---|---|---|---|
| 1 | Requirement review | Backlog item, registry rows, PRD/TRD sections | Read all; note acceptance criteria and PRD-principle implications | Requirement notes in the plan | Criteria restated in own words; ambiguities listed |
| 2 | Repository analysis | Repo | Search for related code/components/routes/tables; list reusable pieces | Affected-files list | No "does X exist?" unknowns remain |
| 3 | Dependency analysis | DEPENDENCY_MAP, PROJECT_STATUS | Confirm upstream features COMPLETE; identify downstream consumers | Dependency section of plan | Blockers absent or feature marked BLOCKED |
| 4 | Implementation plan | Steps 1–3 | Fill templates/FEATURE_IMPLEMENTATION_PLAN.md → docs/plans/<ID>.md | Approved plan | Founder approval (or pre-authorized scope) |
| 5 | Implementation | Plan | Build per CLAUDE.md §4; small commits referencing FEATURE ID | Working code + migrations | Plan scope done; nothing outside scope touched |
| 6 | Code review | Diff | Self-review per CODE_REVIEW_PROCESS.md; report important issues BEFORE fixing big ones | Review notes | All checklist categories addressed |
| 7 | Testing | TESTING_STRATEGY category for this feature | Write/execute required tests incl. authorization + edge cases | Passing suite | Category-required tests green in CI |
| 8 | Bug fixing | Failures | Fix; re-run affected tests; note root causes | Green CI | Zero known regressions |
| 9 | Verification | Acceptance criteria | Walk each criterion against the running app (record how) | Verification note in plan | Every criterion checked, none skipped |
| 10 | Documentation update | Changes made | Update architecture docs/runbook/DECISION_LOG as applicable | Updated docs | Docs match reality |
| 11 | Status update | — | Update REQUIREMENTS_REGISTRY + PROJECT_STATUS (same commit) | COMPLETE status | CLAUDE.md §6 all true |
