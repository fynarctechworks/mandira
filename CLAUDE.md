# CLAUDE.md — Mandhira Operating Manual

Permanent operating manual for Claude Code (and any AI agent or developer) working on Mandhira. Read this before any task. It is enforced, not advisory.

## 1. Project context
- **Product:** Mandhira — an intelligent pilgrimage travel platform. The user defines what matters (FIXED / PROTECTED / IMPORTANT / OPTIONAL); Mandhira makes the journey work: discovery on trusted knowledge, priority-based planning, Journey Health, adaptive replanning via Change Cards, NOW/NEXT/LATER live guidance, offline continuity — plus a complete Ops platform (sources → review → verify → approve → publish → monitor).
- **Domain concepts you must know:** priority tiers and their engine rules; Journey Health (Comfortable/Tight/At Risk/Broken from 5 checks); the option ladder (fixed order a–f; never remove PROTECTED, never move FIXED); return guard; trust records (source tier T1–T5, verification status, freshness fresh/aging/stale, confidence high/medium/low, conflict flag); publish gate (`≥ human_reviewed` or invisible to travelers); Change Card contract (What changed / Why / Recommended+because / options / Keep as is); KnowledgeBundle (= Dexie snapshot = engine input, one type).
- **Architecture:** Next.js 15 monorepo (apps/web traveler PWA, apps/ops) on Vercel; Supabase Postgres (+PostGIS, pg_cron, pgvector, pg_trgm) in Mumbai; pure `packages/journey-engine`; `packages/providers` abstraction (AI: Gemini first; routing: ORS; weather: Open-Meteo; email: Resend; push: VAPID); Dexie + Serwist offline; next-intl + `_i18n` jsonb i18n.
- **Repository structure:** see README.md tree (approved). Docs live in `docs/`.

## 2. Source of truth (priority order)
1. Approved decisions in `docs/DECISION_LOG.md` and founder instructions in-conversation.
2. `docs/PRD.md` — product behavior, principles, copy, design.
3. `docs/TRD.md` — schema, APIs, stack, budgets, jobs (names are normative).
4. `docs/*ARCHITECTURE*.md`, `AUTHORIZATION_MODEL.md`, `INTEGRATIONS.md`.
5. `docs/REQUIREMENTS_REGISTRY.md` (+ FEATURE_INVENTORY, DEPENDENCY_MAP, ROADMAP, BACKLOG).
6. Existing implementation patterns in the repo.
7. General best practices.

**If two sources conflict: STOP. Report the conflict with both citations and a recommendation. Do not silently choose.** Same rule for material ambiguity that affects architecture, data, privacy, or trust behavior.

## 3. Mandatory workflow (before implementing anything)
1. Read the backlog item + its requirement rows + the relevant PRD/TRD sections.
2. Search the repo for existing related code (`grep`/glob for the feature's nouns). Never assume absence without searching.
3. Identify affected modules/files and dependencies (check `docs/DEPENDENCY_MAP.md`; do not start if a dependency isn't COMPLETE in `docs/PROJECT_STATUS.md`).
4. For significant features (new table/route/engine change/permission change or >~3 files): fill `docs/templates/FEATURE_IMPLEMENTATION_PLAN.md` into `docs/plans/<FEATURE_ID>.md` and get it approved (or state it and proceed only if the founder pre-authorized).
5. Set the feature to `IN_PROGRESS` in `docs/PROJECT_STATUS.md`.
6. Implement per §4. 7. Review per `docs/CODE_REVIEW_PROCESS.md`. 8. Test per `docs/TESTING_STRATEGY.md`. 9. Update docs + registry + status.

## 4. Coding rules
- Reuse existing patterns and components (`packages/ui`); no duplicate functionality; no unnecessary dependencies (adding a package = plan-level decision) or speculative abstractions.
- Keep business logic out of components: journey logic in `packages/journey-engine` only; data rules in `packages/db`/SQL; providers only in `packages/providers` (vendor SDK imports elsewhere are lint failures).
- Follow the schema and route names verbatim from the TRD; use generated types; validate all inputs with Zod; use the `withApi` wrapper on every route.
- Every view: loading/empty/error/success states; copy per PRD §12.7 (no "error/failed/URGENT", always "because", always "keep as is").
- Every state-changing journey action requires an explicit user tap (PRD Principle 6). Every recommendation ships a reason.
- Authorization: enforce in RLS + server route + workflow constraint; UI hiding is never a control.
- Auditability: Ops mutations must hit `audit_log`/`entity_versions` (triggers) — verify when adding tables.
- Accessibility: WCAG 2.2 AA, 44 px targets, icon+text status, i18n-externalised strings, mobile-first responsive.
- Trust: every critical field rendered shows a TrustBadge; AI text is labelled "Mandhira summary" and never Verified.
- Preserve backward compatibility (additive migrations; view shape changes need DECISION_LOG + Dexie version bump).

## 5. Safety rules — Claude must NEVER
- Delete or rewrite working functionality without mapping its dependents first; no large-area rewrites without a documented reason and approval.
- Change or print environment secrets; commit credentials; weaken CSP/RLS "temporarily".
- Bypass authorization, the publish gate, grounding checks, or rate limits — including in tests (use fixtures/roles instead).
- Auto-apply journey changes, hide low-confidence badges, or let AI write facts to knowledge tables.
- Touch `traveler_profiles` from any Ops/analytics/export path.
- Modify unrelated files, reformat wholesale, or "clean up" outside task scope.
- Assume a feature/table/route doesn't exist without searching; invent requirements not in the PRD/TRD/registry.
- Mark anything COMPLETE without the §6 checklist verified.

## 6. Definition of Done (all required)
1. Registry requirements implemented; 2. acceptance criteria demonstrably satisfied (test or recorded check); 3. tests added/updated per TESTING_STRATEGY (engine changes keep ≥90% coverage); 4. `pnpm typecheck` passes; 5. `pnpm lint` passes; 6. `pnpm build` passes for affected apps; 7. no regressions in existing tests/flows; 8. permissions verified (RLS test or role test for new surfaces); 9. edge/error cases handled per plan; 10. docs updated (architecture docs if patterns changed, runbook if ops-relevant); 11. `REQUIREMENTS_REGISTRY.md` + `PROJECT_STATUS.md` updated in the same commit.

## 7. Session discipline
Start every session by reading `docs/PROJECT_STATUS.md` + current backlog item. End every working session by updating status/notes so the next session (human or AI) loses nothing. Log every non-trivial decision in `docs/DECISION_LOG.md` with the next free ID.
