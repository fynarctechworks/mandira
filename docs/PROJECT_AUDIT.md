# Mandhira — Complete Project Audit

**Date:** 2026-09-12 · **Auditor:** Claude Code (7 parallel verification agents + direct verification)
**Commit audited:** `d39d7dc` "Adopt the shadcn base-lyra preset as the design system, in #FF660E"
**Scope:** PRD v1.0, TRD v1.0, CLAUDE.md, 28 migrations, 43 pages, 24 API routes, 42 vitest files, 24 Playwright specs, 28 pgTAP files, 30 plan docs, 149 decision-log entries.

> **How this audit was produced.** Nothing here is inferred from a filename. Every "Complete"
> is backed by a file:line reading of the implementation; every gate result below was produced
> by executing the command. Claims from the project's own documents were treated as claims,
> not evidence, and checked against code. Anything that could not be executed in this
> environment is explicitly marked **Needs Verification**.

---

## 1. Executive summary

Mandhira is a **genuinely well-built product with a documentation layer that has drifted badly out of sync with it**, and a small number of real defects that matter more than their line count suggests.

The engineering quality is high and unusual: 686 unit tests pass, the journey engine holds 99.68% statement coverage against a 90% gate, typecheck/lint/build are all clean, there are **zero** TODO/FIXME/HACK markers in the entire source tree, no committed secrets have ever entered git history, and migrations are strictly additive. The offline stack, the trust layer and the copy-rule enforcement are better than most shipped products.

Against that, five findings are serious:

| # | Finding | Severity |
|---|---|---|
| 1 | **The publish gate is bypassable.** Any of 4 Ops roles can `UPDATE … SET status='published'` directly via PostgREST, skipping validation, four-eyes and audit. No trigger guards it. | **Critical** |
| 2 | **Change Cards mislabel destructive options.** Ladder step `e` (*remove an optional item*) is shown as "Swap the order of two things"; step `f` (*remove an IMPORTANT item*) says "the one you marked as optional". Travelers consent to a description that is not the change. | **Critical** |
| 3 | **`anon` can enumerate and read unpublished content** via `entity_media` → `accessibility_for()` / `entity_trust()`, both `SECURITY DEFINER`, both granted to `anon`, neither checking publish status. | **High** |
| 4 | **No audit trigger exists.** CLAUDE.md §4 and TRD §6.1 both require every Ops mutation to write `audit_log`. It has exactly 2 write sites, both inside `publish_entity`. Trust-record changes, role grants and source edits leave no trail. | **High** |
| 5 | **Travel time silently falls back to 0 minutes.** Nothing ever writes `travel_estimates`; `getRoutingProvider()` has zero call sites. For any real destination, travel between places with no authored connection costs nothing, so Journey Health and the return guard are optimistic. | **High** |

Two further facts shape everything below:

- **CI has never run.** There are no remote-tracking refs; all 46 commits are local-only. Every workflow gate is unproven on a clean runner.
- **`main` cannot currently deploy.** `pnpm check:bundle` exits 1 — the new `/design-system` route ships 513.8 kB against the 180 kB TRD-PERF-001 ceiling, and `deploy.yml` runs that check before promotion.

### Scorecard

| Measure | Score | Basis |
|---|---|---|
| **Overall completion (M1–M4 complete product)** | **≈ 60%** | Weighted by TRD §11.1 milestone estimates; M5 growth excluded |
| **Overall including M5** | ≈ 49% | M5 (30 of 110 days) is untouched |
| **PRD completion** | **≈ 60%** | Mean across F1–F20, weighted by evidence below |
| **TRD completion** | **≈ 58%** | Mean across §2–§12 |
| **CLAUDE.md compliance** | **≈ 70%** | §2 exemplary; §4 and §6 have real violations |

### Executed gate results (hard evidence, run 2026-09-12)

| Gate | Result | Detail |
|---|---|---|
| `pnpm typecheck` | ✅ **PASS** | 7/7 packages, 0 errors, cache defeated with `--force` |
| `pnpm lint` | ✅ **PASS** | 7/7 packages, 0 errors, 0 warnings |
| `pnpm build` | ✅ **PASS** | both apps, 1m30s, 0 warnings |
| `pnpm test` | ✅ **PASS** | 42 files, **686/686 tests**, 0 skipped |
| `pnpm test:engine` coverage | ✅ **PASS** | Stmts 99.68% · Branches 91.84% · Funcs 100% · Lines 99.68% vs 90% gate |
| `pnpm check:bundle` | 🔴 **FAIL** | `/design-system` 513.8 kB vs 180 kB ceiling — **blocks `deploy.yml`** |
| Playwright e2e (219 cases) | ⚠️ **Stale** | Last recorded pass **2026-08-26**, 17 days and 2 commits ago; never run in CI |
| pgTAP (536 assertions) | ⚠️ **Needs Verification** | Supabase containers exited 10 days ago; not started per audit constraints |
| GitHub Actions CI | 🔴 **Never executed** | No remote refs exist |

---

## 2. Master audit table

Status key: ✅ Complete · 🟡 Partially Complete · 🔴 Not Started · ⚠️ Blocked/Broken

### 2.1 Platform & foundations

| ID | Module/Feature | Requirement | Status | % | Evidence/Files | What's Done | What's Pending | Issues/Gaps | Priority | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|
| PLAT-01 | Monorepo & tooling | TRD-ARCH-001/006 | ✅ | 100% | `turbo.json`, `pnpm-workspace.yaml`, `.github/workflows/{ci,deploy,backup}.yml` | pnpm+turbo, 2 apps, 6 packages, all scaffolds | — | CI never executed (no remote) | P0 | Push to origin |
| PLAT-02 | Design system | PRD-DSGN-001..004/006 | 🟡 | 55% | `packages/ui/src/components/ui/` (62 files), `design-system.css`, D-148 | shadcn base-lyra preset adopted at #FF660E; reference page renders all components both themes | 45 existing routes not migrated; 21 legacy Radix components retained | **44 px target regression** (`button.tsx:23-26` `h-8`/`h-9` = 32/36 px) vs WCAG 2.2 AA; **3 systematic contrast failures** in `mist` palette; 62 preset components imported by **one non-production surface** | P0 | Decide: migrate routes or revert preset; fix target size before phone ship |
| PLAT-03 | Database schema | TRD-DB-001/002/004/005 | ✅ | 95% | 28 migrations, **56 tables**, 27 enums, 12 views, 44 functions, 44 triggers | Every TRD §4 table present; additive-only; `db reset` CI-enforced | — | Doc counts wrong (51/68/55 claimed vs 56 actual); `entity_versions` missing on 8 tables | P1 | Correct doc counts; extend version triggers |
| PLAT-04 | RLS & authorization | TRD-DB-003, PRD-PRIV-002 | ⚠️ | 70% | `0008_rls_policies.sql`, 61 policies | RLS on **all 56 tables**; owner-only journeys; `traveler_profiles` has no Ops policy | Publish-status guard; anon surface narrowing | **F1 publish bypass** (`0008:156-161` blanket UPDATE, no status guard); **F3 anon reads drafts**; `record_audit` granted to all authenticated | **P0** | Add BEFORE UPDATE trigger rejecting `status='published'` outside `publish_entity()` |
| PLAT-05 | Traveler shell & PWA | TRD-DEPL-002, PRD-OFFL-002 | ✅ | 95% | `apps/web/app/sw.ts`, `manifest.ts`, `middleware.ts` | Serwist, `skipWaiting:false`, manifest, install prompt, offline banner, device cookie | — | — | P1 | — |
| PLAT-06 | Observability & quality | TRD-PERF-001, PRD-ANLY-001 | 🟡 | 75% | `packages/config/security-headers.mjs`, `packages/db/src/{analytics,reporting}.ts` | CSP/HSTS both apps; analytics allowlist (name + property); copy scanner; bundle check script | Sentry adapter (needs DSN) | CSP ships `script-src 'unsafe-inline'` (D-114); **bundle check currently failing** | P0 | Fix `/design-system` budget |
| PLAT-07 | Production readiness | TRD-DEPL-001/003 | ⚠️ | 60% | `scripts/preflight.mjs`, `backup-verify.sh`, `deploy.yml`, `RUNBOOK.md` | Preflight guards, verified encrypted backup+restore, migration-before-promote gate, 8-test smoke | Everything requiring an actual deployment | **Blocked**: GIT-01 push creds, OPEN-003 domain, ACCT-01/02/06 | **P0** | Resolve GIT-01 first — it gates all of it |
| PLAT-08 | Rate limiting & CSP | TRD-SEC-001/002 | 🟡 | 55% | `0012`, `0018`, `packages/db/src/rate-limit.ts` | DB limiter atomic, service-role-only, **fails closed**; all 11 scopes declared | 6 scopes unused; Ops actions unlimited | **No status row in PROJECT_STATUS.md at all**; `auth_magic_link` unenforceable (client-side GoTrue call) | P1 | Add limits to `opsAction`; wire remaining scopes |
| API-01 | Route pipeline | TRD-API-001 | ✅ | 90% | `packages/db/src/api.ts:134-196` | `withApi`: Zod → auth → roles → rate limit → envelope, `no-store`, no stack leak | Ops-bound instance | `roles` option used by **zero** routes; 1 route test for 23 route files | P1 | Add route-level authz tests |
| JOBS-01 | Scheduled jobs | TRD-API-004 | 🟡 | 70% | `0013:499-509` (5 pg_cron), 3 Vercel cron routes | 5 pg_cron jobs + single-flight `run_scheduled_job()` + `job_runs` + `v_job_health` | Alerting on `v_job_health` | `supabase/functions/` is **empty** — all 4 spec'd Edge Functions became Vercel crons with different names/cadences; docs claim "3 jobs", there are 5 | P1 | Reconcile TRD §5.4 with reality in DECISION_LOG |

### 2.2 Traveler app — PRD F1–F16

| ID | Module/Feature | Requirement | Status | % | Evidence/Files | What's Done | What's Pending | Issues/Gaps | Priority | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Knowledge model | PRD-KNOW-001..006 | ✅ | 90% | `0003_knowledge.sql`, `0007_published_views.sql` | All F1 entities; trust record per critical field; freshness/confidence derived in DB | — | Publish gate bypassable (F1); `disputed` sorts above `verified` in enum | P0 | See PLAT-04 |
| F2 | Discovery | PRD-DISC-001..008 | 🟡 | 65% | `app/[locale]/{page,search}.tsx`, `destinations/[slug]/**`, `lib/present.ts` | Home, destination (F2 section order), place, experience pages; search as GET form (works without JS); per-field trust badges | **"Add to journey" does not exist on any page**; "See all" past 20; journey-aware ranking | `TierChip` interactive variant unused; 4 of 6 filters | **P0** | Build PRD-DISC-004 add-to-journey sheet — discovery currently cannot reach the planner |
| F3 | Intent capture | PRD-INT-001..006 | 🟡 | 35% | `app/[locale]/plan/page.tsx`, `providers/src/ai/**` | Structured form (also the §5.5 fallback); AI provider package, grounding, cache, rate limits, `journeyBriefSchema` closed over published IDs | **A07 NL input, A08 brief review, `/api/intent/extract`** | AI package has **zero consumers**; `ai-store.ts` dead; brief expresses only 2 of 4 tiers (`build.ts:113-114`) | P0 | Blocked on ACCT-04 (Gemini key) + B-013 content |
| F4 | Journey builder | PRD-PLAN-001..010 | 🟡 | 75% | `journeys/[id]/page.tsx`, `lib/item-rules.ts` | Day timeline, tier chips, visible/editable buffers, item actions each an explicit tap, tier rules enforced at route | Drag-and-drop; "Simplify this day"; FIXED/OPTIONAL at creation | `@dnd-kit` specified but unused | P1 | Add simplify-day (reuses ladder) |
| F5 | Health engine | PRD-HLTH-001..005 | 🟡 | 75% | `packages/journey-engine/src/health.ts` | All 5 checks wired (`:134,161,202,224,229`); 4 states; causes as i18n keys; all 3 physical rules | A12 health-detail sheet | **Time-load window ignores "→ next FIXED item"** (`:132`); **availability checks start minute only** (`:178-188`); **return-guard breach marks every day Broken** (`:233`); empty days absent from report | P1 | Fix window + attribution |
| F6 | Adaptive replanning | PRD-ADPT-001..008 | ⚠️ | 70% | `change.ts:216-400`, `components/change-sheet.tsx` | Ladder a–f in fixed order, stops at first Tight-or-better; FIXED never moved, PROTECTED never removed (asserted ×10 triggers); nothing applied without a tap | Before/after times per option | **UI mislabels rungs c/d/e/f — removals shown as reorders** (`change-sheet.tsx:111-124`); **low-confidence line unreachable** (key mismatch `:161` vs `health.ts:412`); cross-day state leakage suppresses cards | **P0** | Render engine `labelKey`/`becauseKey` instead of the hardcoded map |
| F7 | Prepare | PRD-PREP-001..004 | ✅ | 85% | `journeys/[id]/{prepare,summary}`, `prepare.ts` | F7 groups, dedup, trust badge + Why?, ticks persist, printable 1×A4/day (measured), 32-byte revocable share | `documents` group emission | `prepare.ts:4` declares `documents`, no task ever emitted | P2 | Emit documents tasks |
| F8 | Live NOW/NEXT/LATER | PRD-LIVE-001..006 | ✅ | 90% | `components/live-journey.tsx`, `lib/live-view.ts` | One scroll, no calendar, health pill, exactly 3 actions, recomputes from IndexedDB against real clock | Practical chips (needs MAPS-02), phrase shortcut | **No `aria-live`** anywhere — countdown/health changes never announced | P1 | Add live region |
| F9 | Trust layer | PRD-TRST-001..006 | ✅ | 85% | `components/{field-trust,fact-row,trust-badge}.tsx` | Per-field badges, trust sheet ≤1 tap, sources footer, renders nothing when no record | Stale in-journey note | **"Mandhira summary" label absent repo-wide** (no AI text rendered yet, so latent) | P1 | Add label before any AI prose ships |
| F10 | Live & dynamic info | PRD-DYN-001..005 | 🟡 | 60% | `0023`, `api/cron/feeds`, `providers/src/weather` | Weather via Open-Meteo (no key needed); provider+timestamp are **columns** so a value can't render without them; failed poll writes `unavailable` | **Transport feed** | Blocked OPEN-002; `v_published_live_conditions` ungated + exposes `affects_entity_ids` | P1 | Founder: name transport provider |
| F11 | Offline | PRD-OFFL-001..007 | ✅ | 90% | `lib/offline/{db,snapshot,outbox,replan-local}.ts` | Dexie v2 verbatim TRD §4.8; one-payload snapshot; ordered outbox replay stopping at first failure; **offline replanning via real `evaluateChange`**; no sync-error dialog exists | Map tiles (P2) | Traveler profiles deliberately not cached — card discloses it | P2 | — |
| F12 | Multilingual & phrases | PRD-LANG-001..004 | 🔴 | 15% | `messages/{en,hi,te}.json` | 14 keys in en | **te/hi files are 14 keys of `""`**; no locale switcher; phrase UI | **~261 hardcoded English strings across 55 files**; engine emits 34 i18n keys with no catalog; `LOCALE_LABELS` has zero consumers; `schedule.ts` returns raw English prose | P1 | Large: build `ui_strings` pipeline (B-034) |
| F13 | Accounts & personalization | PRD-ACCT-001..005 | 🟡 | 45% | `0009_auth.sql`, `packages/db/src/client/**` | Magic link + guest + profile trigger + draft claim | **A23 Profile & Travelers screen**, A22 Saved places, DPDP export/delete, personalization ranking | **3 of 4 bottom-nav tabs are 404s** (`bottom-nav.tsx:18-21` → `/journey`,`/prepare`,`/profile` have no routes) | **P0** | Fix nav; build A23 (carries DPDP controls) |
| F14 | User reports | PRD-REPT-001..005 | ✅ | 80% | `api/reports`, Ops `/reports` | 6 types, 500 chars, queue with 3 outcomes, resolution notification, auto-downgrade reachable | Photos (M4); guest reporting | OPEN-013 undecided | P2 | Founder decision |
| F15 | Notifications | PRD-NOTF-001..003 | ✅ | 80% | `api/notifications/**`, `api/cron/notifications` | 7 types + defaults, prefs UI, in-app list, scheduler, VAPID sender, weekly cap at schedule time | **Local offline leave-by** | Not scheduled in service worker | P1 | Add SW scheduling |
| F16 | Complete & reflect | PRD-CMPL-001..004 | ✅ | 85% | `journeys/[id]/record/**`, `api/.../complete` | Record from Done taps only; no score/percentage/badge; 3 private questions; plan-similar copies tiers | Personalization ranking | Needs >1 destination | P2 | Blocked on OPEN-001 |

### 2.3 Ops platform — PRD F17–F20

| ID | Module/Feature | Requirement | Status | % | Evidence/Files | What's Done | What's Pending | Issues/Gaps | Priority | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|
| F17a | Source registry (O08) | PRD-OPS-SRC-001 | 🟡 | 70% | `(ops)/sources/**` | Type/tier/cadence/status/method registry | **Captures & diffs on source detail** (PRD §5.2 names them) | Detail page is a form only; `source-form.tsx:236` tells operators "Collection is manual for now" — **B-029 made that false** | P1 | Add captures/diffs panel; fix stale copy |
| F17b | Ingestion & change detection | PRD-OPS-SRC-002/004 | ✅ | 80% | `lib/ingestion.ts:54-271`, `api/cron/ingest` | Real fetch→hash→capture→diff→candidate; SSRF guard blocks private/loopback/metadata, re-checked per redirect | — | TEST-02: fetch→detection seam has no e2e | P1 | Runner test with stub capture |
| F17c | AI extraction | PRD-OPS-SRC-003 | 🔴 | 5% | `ingestion/page.tsx:99-107` | Declared absent in-product rather than faked | Everything | Blocked ACCT-04 | P1 | Needs Gemini key |
| F17d | Conflict auto-detection | PRD-OPS-SRC-005 | 🔴 | 0% | OPEN-014 / D-145 | — | Schema cannot hold 2 competing claims (`trust_records` unique per field) | **Founder schema decision required** | P1 | Decide: claims table vs defer |
| F18a | Review queue (O10) | PRD-OPS-WF-001 | ✅ | 95% | `review/page.tsx`, `decide_change_candidate` | Side-by-side, excerpt, accept/reject; **structurally cannot publish** (pgTAP asserts entity untouched) | — | — | — | — |
| F18b | **Verify queue (O11)** | PRD-OPS-WF-002 (**P0**) | 🔴 | 25% | `lib/nav.ts:123` `href:null` | Verification exists as an inline trust panel | **The queue screen itself** | Nav says `comingIn:"B-012"` — the very item PROJECT_STATUS marks COMPLETE | **P0** | Build O11 |
| F18c | Conflicts (O12) | PRD-OPS-WF-003 | 🟡 | 75% | `conflicts/**`, `0028` | All 3 outcomes real; escalate deliberately keeps the flag | Auto-detection | See F17d | P1 | — |
| F18d | Approve & publish (O13) | PRD-OPS-WF-004 | 🟡 | 70% | `publish/**`, `0026:205` | Validation blocks naming the field; separation of duties enforced twice; impact count via aggregate-only definer | Scheduled publish | **Queue lists only 3 of 8 publishable types**; bypassable (F1) | P0 | Add missing types; add status trigger |
| F18e | Reports queue (O14) | PRD-OPS-WF-005 | ✅ | 95% | `reports/**` | 3 outcomes incl. "Couldn't verify"; resolving never edits knowledge | — | — | — | — |
| F18f | Freshness monitor (O15) | PRD-OPS-WF-006 | ✅ | 100% | `freshness/**`, `0027` | All 5 PRD filters, worst-first, bulk reverify, SQL-sourced so it can't drift | — | — | — | — |
| F18g | Impact before publish | PRD-OPS-WF-007 | ✅ | 100% | `0026:205-260`, `lib/impact.ts` | Publish writes `knowledge_updates` in same txn; traveler session builds the card (privacy boundary) | — | — | — | — |
| F18h | **Audit & versions (O20)** | PRD-OPS-WF-008 (**P0**) | ⚠️ | 20% | `nav.ts:137` `comingIn:"M4"` | `entity_versions` on 11 knowledge tables | **Viewer UI; restore; audit triggers** | **No audit trigger exists anywhere**; `audit_log` has 2 write sites | **P0** | Add triggers + O20 viewer |
| F18i | RBAC & separation of duties | PRD-OPS-WF-009 | ✅ | 85% | `0009`, `lib/action.ts:35-66` | 9 roles, trigger + publish-time enforcement, 38/38 actions role-gated | Role admin UI | **2 exported server actions bypass `opsAction`** (`publish/actions.ts:108`, `trust/actions.ts:120`) | P1 | Wrap both |
| F19a | Entity editors (O02–O07) | PRD-OPS-CNT-001 | ✅ | 90% | 25 Ops pages | All F1 entities, structured forms, inline trust panel | Preview-as-app | 3 near-identical table components | P2 | Deduplicate |
| F19b | Media library (O16) | PRD-OPS-CNT-003 | 🟡 | 60% | `media/**` | Upload, variants, licence required | Crop presets, usage list | No error state | P2 | — |
| F19c | Translation workspace (O17/O18) | PRD-OPS-CNT-004 | 🔴 | 0% | `nav.ts:141-151` | — | Everything | M4 | P1 | B-034 |
| F20a | **Knowledge health dashboard (O01)** | PRD-OPS-MON-001 | 🔴 | 5% | `app/(ops)/page.tsx:12-59` | Renders a list of built vs unbuilt screens | **Zero metrics** | No freshness %, conflicts, queue ages, locale completeness | P1 | Build from existing SQL |
| F20b | Product signals (O22) | PRD-OPS-MON-002 | 🔴 | 0% | — | `analytics_events` collects | Dashboard | — | P2 | M4 |
| F20c | Admin tools (O19/O21) | PRD-OPS-MON-003 | 🔴 | 0% | `nav.ts` | — | Users/roles UI, advisories publisher, feature flags | **Roles grantable only by direct DB access** | P1 | Build O21 |

### 2.4 Cross-cutting / TRD

| ID | Module/Feature | Requirement | Status | % | Evidence/Files | What's Done | What's Pending | Issues/Gaps | Priority | Next Action |
|---|---|---|---|---|---|---|---|---|---|---|
| ENG | Journey engine | TRD-ENG-001/002 | ✅ | 90% | `packages/journey-engine/src/**` | All 10 §5.1 functions; pure, no ambient clock; **99.68% coverage, 260 tests**; KnowledgeBundle = Dexie snapshot | Performance benchmark | No ≤500 ms benchmark exists in package; 4 logic defects (see §7) | P1 | Add benchmark; fix defects |
| API-T | Traveler API surface | TRD-API-002 | 🟡 | 45% | `apps/web/app/api/**` | 22 route files, all `withApi`+Zod+authz+rate-limited | **10 spec'd routes missing** | `intent/extract`, `PATCH /journeys/:id`, `POST /items`, `reorder`, `travel-estimate`, `search`, `live/:id`, `account/export`, `account/delete`, `auth/migrate-draft`; 6 more at divergent paths | P0 | Reconcile per CLAUDE.md §2 |
| API-O | Ops API surface | TRD-API-003 | 🟡 | 30% | 14 `actions.ts` | Functionally complete + role-gated | — | **All 16 TRD §5.3 routes implemented as Server Actions, not HTTP routes** — no DECISION_LOG entry | P1 | Log the decision or add routes |
| PROV | Provider abstraction | TRD-ARCH-003 | 🟡 | 65% | `packages/providers/**` | Weather, Push, Geocoding, Capture **complete**; lint rule **verified firing** by probe; zero vendor leaks | **Email/Resend missing entirely** | AI = 1 of 7 methods + zero consumers; **Routing = zero callers**; lint rule has 2 holes (fixed SDK list; only `next.js` config) | P0 | Wire routing; add Resend |
| AI | AI integration | TRD-AI-001..004 | 🟡 | 30% | `providers/src/ai/**`, `0012` | Abstraction, env model tiers, 12s+retry+fallback, `ai_calls` w/o identifiers, `ai_cache`, ID grounding via `keepKnownIds` | Consumers | `assertGrounded` has **zero production call sites**; "Mandhira summary" absent; `ai-store.ts` dead code | P0 | Blocked ACCT-04 |
| SEC | Security & rate limiting | TRD-SEC-001..004 | 🟡 | 60% | `0008`, `0012`, `0022`, `security-headers.mjs` | RLS on 56/56 tables; 32/32 definer functions pin `search_path`; TRUNCATE revoked; limiter fails closed; share tokens safe; **no secret ever in git history** | — | F1 bypass, F3 anon exposure, no audit trigger, 6 unused scopes, no Ops limits, CSP `unsafe-inline` | P0 | §8.1 |
| PERF | Performance | TRD-PERF-001..003 | 🟡 | 50% | `scripts/check-bundle.mjs` | Budget script real and enforced in deploy | Lighthouse, p95 measurement | **Currently failing**; health p95 measured only on localhost (119/199 ms) | P0 | Fix budget |
| DEPL | Deployment & CI/CD | TRD-DEPL-001..003 | ⚠️ | 40% | `.github/workflows/**` | 3 workflows; migration-before-promote; verified backup/restore | Execution | **CI has never run**; e2e ungated in CI; `format:check` ungated | P0 | GIT-01 |
| TEST | Testing | TESTING_STRATEGY | 🟡 | 70% | 42 vitest + 24 Playwright + 28 pgTAP | 686 unit tests pass; 620 pgTAP assertions; axe on 14 specs with **no exception list**; 200% text-scale + dark-mode specs | Route-level authz tests | **1 route test for 23 route files**; e2e never in CI, last run 17 days ago; no pinned-`search_path` test; no publish-bypass test | P0 | Add e2e to CI |

---

## 3. Completion percentages

### 3.1 Overall — ≈ 60% (of the M1–M4 complete product)

Weighted by TRD §11.1 day estimates:

| Milestone | Est. days | Complete | Weighted |
|---|---|---|---|
| M1 Foundation + vertical slice | 20 | ~85% | 17.0 |
| M2 Adapt & live | 15 | ~90% | 13.5 |
| M3 Trusted knowledge at scale | 25 | ~70% | 17.5 |
| M4 Language & completion | 20 | ~30% | 6.0 |
| **Subtotal (complete product)** | **80** | | **54.0 → 67%** |
| M5 Ecosystem growth | 30 | 0% | 0 |
| **Total including M5** | **110** | | **49%** |

Adjusting the M1–M4 figure downward for the defects that make "done" features not shippable (F1 publish bypass, F6 mislabelled options, F13 broken nav, F12 i18n shell) gives **≈ 60%** as the honest headline.

### 3.2 PRD — ≈ 60%

| Feature | % | Feature | % |
|---|---|---|---|
| F1 Knowledge model | 90 | F11 Offline | 90 |
| F2 Discovery | 65 | F12 Multilingual | 15 |
| F3 Intent capture | 35 | F13 Accounts | 45 |
| F4 Journey builder | 75 | F14 Reports | 80 |
| F5 Health engine | 75 | F15 Notifications | 80 |
| F6 Adaptive replanning | 70 | F16 Complete & reflect | 85 |
| F7 Prepare | 85 | F17 Ops ingestion | 60 |
| F8 Live journey | 90 | F18 Ops workflow | 65 |
| F9 Trust layer | 85 | F19 Ops content | 45 |
| F10 Live & dynamic | 60 | F20 Ops monitoring | 10 |

**Mean = 60.25%.** Screen inventory: **17 of 25** traveler screens exist (A01, A07, A08, A12, A17, A22, A23 missing; A24 partial); **17 of 22** Ops screens exist (O01 empty shell, O11, O17–O22 missing).

### 3.3 TRD — ≈ 58%

| Section | % | Note |
|---|---|---|
| §2 Architecture rules | 85 | All 7 rules honoured; email provider absent |
| §3 Stack pins | 75 | TanStack Query, MapLibre, @dnd-kit, Sentry, Resend unused/absent |
| §4 Schema | 95 | No TRD table missing |
| §5.1 Engine functions | 95 | All 10 present |
| §5.2 Traveler API | 45 | 10 missing, 6 divergent |
| §5.3 Ops API | 30 | Zero as HTTP routes |
| §5.4 Background jobs | 70 | Edge Functions dir empty |
| §5.5 Degradation | 65 | Routing/AI fallbacks unwired |
| §6 Security | 60 | See §8.1 |
| §7 AI integration | 30 | Built, not connected |
| §8 Deployment | 40 | Never executed |
| §9 Performance | 50 | Budget failing |
| §10 Cost controls | 40 | No quota alerts |

**Mean = 60%**, adjusted to **58%** for §12's M1 criteria: of 15 technical success criteria, **6 are unmet** (#2 partially — Verify queue absent; #4 unmeasured; #5 intent extraction absent; #8 — no content to render; #13 bundle budget failing; #15 not deployed).

### 3.4 CLAUDE.md compliance — ≈ 70%

| Section | Compliance | Evidence |
|---|---|---|
| §2 Source-of-truth conflicts | **95%** — exemplary | DOC-01, DOC-02, OPEN-014, OPEN-009 all reported with citations + recommendation instead of silently chosen |
| §3 Mandatory workflow | 60% | **8 implemented features have no plan file** (B-006 RLS matrix across 56 tables is the worst); PROJECT_STATUS granularity is 23 rows for ~130 feature IDs |
| §4 Coding rules | 65% | ✅ logic placement, Zod, explicit tap, copy §12.7 (scanner-enforced), TrustBadge coverage. ❌ **no loading states anywhere**, **error states missing** (web data layer has 0 `.error` checks across 21 queries; 6 Ops pages), **audit_log requirement unmet**, **44 px regressed**, duplicate components, "Mandhira summary" absent |
| §5 Safety rules | 95% | No secrets committed (verified across full history), no auth bypass in tests, migrations additive, no destructive ops |
| §6 Definition of Done | 70% | typecheck/lint/build/tests/coverage all **pass**; but #7 (no regressions) unproven, #8 (permissions) unverified 10 days, #11 registry/status **overstate reality** |
| §7 Session discipline | 90% | 149 decision-log entries, genuinely high quality; D-077 missing from sequence |

---

## 4. Complete list of every pending feature/task

### 4.1 Blocked on founder input (cannot be worked around)

| ID | Need | Blocks |
|---|---|---|
| **GIT-01** | Push credentials for `fynarctechworks/mandira` | All CI, all of B-025, every deploy. **46 commits local-only** |
| **OPEN-001** | Launch destination #1 (ideally #2–#3) | B-013 seed content → B-015 completion → B-018 → B-032 → PERS-01/02 |
| ACCT-04 | Gemini API key | F3 intent extraction, F17c AI extraction, F17d conflict auto-detect |
| ACCT-01 | Resend account + verified domain | Production sign-in (most travelers cannot sign in without it) |
| ACCT-02 | Google OAuth client | "Continue with Google" |
| ACCT-03 | MapTiler key | MAPS-02 only |
| ACCT-05 | ORS key | Travel accuracy only (but see §7 — provider is unwired regardless) |
| ACCT-06 | Sentry DSN | Error alerting |
| OPEN-002 | Transport feed provider | PRD-DYN-005 |
| OPEN-003 | Production domain | Prod DNS |
| OPEN-013 | Guest reporting yes/no | Guest reports |
| OPEN-014 | Conflict-claims schema decision | PRD-OPS-SRC-005 auto-detection |
| OPEN-004/005/006/007 | te/hi eval, locale confirm, sourcing stance, ≥10 pilot planners | M2/M4 exits |

### 4.2 Buildable now — defects (no dependency)

1. Publish-status guard trigger (F1) — **Critical**
2. Change Card label/because rendering from engine keys (F6) — **Critical**
3. Low-confidence disclosure key mismatch — High
4. `anon` draft-content exposure: publish checks in `accessibility_for`, `entity_trust`; narrow `entity_media` grant (F3) — High
5. Audit triggers on all Ops-mutated tables (F4) — High
6. Wire `getRoutingProvider()` + write `travel_estimates` cache (F5) — High
7. Bottom-nav 404s: `/journey`, `/prepare`, `/profile` — High
8. `.error` checks across `lib/knowledge.ts` (21 queries), `journeys.ts`, `live.ts`, `record.ts`, `prepare.ts` — High
9. `/design-system` bundle budget — **blocks deploy**
10. Engine: time-load `→ next FIXED` sub-window; availability end-minute; return-guard day attribution; cross-day option leakage
11. Wrap `validationProblems` + `trustForEntity` in `opsAction`
12. Rate limits on `opsAction`
13. Publish queue: add 5 missing entity types
14. `source-form.tsx:236` stale copy
15. 44 px target-size regression in preset

### 4.3 Buildable now — features

16. O11 Verify queue (**P0**, PRD-OPS-WF-002)
17. O20 Audit log & version history + restore (**P0**, PRD-OPS-WF-008)
18. O21 Users & roles admin
19. O01 Knowledge-health dashboard
20. PRD-DISC-004 "Add to journey" + tier picker (**P0** — discovery cannot reach the planner)
21. A12 Health detail sheet
22. A23 Profile & Travelers (carries DPDP export/delete)
23. A22 Saved places
24. "See all" past 20 cards; filters 5 & 6
25. "Simplify this day"
26. `aria-live` regions; skip link; `eslint-plugin-jsx-a11y`
27. `documents` prepare group
28. Local offline leave-by in SW
29. Engine performance benchmark
30. Route-level authz tests; e2e into CI
31. TEST-02 ingestion seam test
32. OPEN-012 transactional `POST /api/journeys`

### 4.4 Blocked by dependency

33. B-013 seed content (OPEN-001) · 34. `/api/intent/extract` + A07/A08 (ACCT-04) · 35. B-032 embeddings (3 destinations) · 36. B-034 i18n pipeline + te/hi · 37. B-035 phrase packs + audio · 38. B-037 Ops dashboards, advisories, report photos, DPDP jobs · 39. MAPS-02 (ACCT-03) · 40. Transport feed (OPEN-002) · 41. B-038+ M5

---

## 5. Missing requirements & implementation gaps

**PRD screens with no route (7):** A01 Welcome & Language · A07 Plan–Intent · A08 Brief review · A12 Health detail · A17 Phrase assistance (Dexie store exists, no UI) · A22 Saved places · A23 Profile & Travelers.

**Ops screens absent (6 + 1 empty):** O01 (renders a nav list, zero metrics) · O11 Verify · O17 Translation · O18 Locales · O19 Advisories · O20 Audit log · O21 Users/roles · O22 Product signals.

**TRD §5.2 routes missing (10):** `POST /api/intent/extract`, `PATCH /api/journeys/:id`, `POST /api/journeys/:id/items`, `POST /api/journeys/:id/reorder`, `GET /api/travel-estimate`, `GET /api/search`, `GET /api/live/:destinationId`, `POST /api/account/export`, `POST /api/account/delete`, `POST /api/auth/migrate-draft`. Plus `GET /api/share/:token` served as a page, not a route.

**TRD §5.2 routes at divergent paths (6):** `/change`→`/changes`, `/change/:id/decide`→`/changes/:id`, `POST status`→`PATCH status`, `/start-day`→`/live`, `/clone`→`GET /similar`, `/push/subscribe`→`/notifications/subscribe`.

**TRD §7.1 AI methods missing (6 of 7):** `explain`, `extractKnowledge`, `detectChanges`, `suggestTranslation`, `classify`, `embed`.

**Rate-limit scopes declared but unused (6):** `intent_extract`, `search`, `travel_estimate`, `ops_ai_extract`, `ops_translate_suggest`, `auth_magic_link`.

**Requirement-level gaps not tracked in the registry:** `PRD-ADPT-004` marked ✅ but before/after times per option are absent from `ChangeOption`. `PRD-ADPT-006` marked ✅ but unreachable. `PRD-DSGN-001` marked RESOLVED and `PRD-DSGN-006` ✅, both invalidated by D-148 and never downgraded.

**Documentation defects (the registry is not a reliable index):**
- `README.md:5` — *"Application implementation NOT started"*; `:41` — *"No application code exists yet by design"*. **Both false** across 46 commits.
- Blanket false headers in `REQUIREMENTS_REGISTRY.md:5`, `FEATURE_INVENTORY.md:3`, `DEVELOPMENT_BACKLOG.md:3` — "NOT_STARTED for every requirement", in files containing 48 ✅ rows.
- Registry footer claims **132 requirements (95/37)**; the file contains **168 rows / 146 unique IDs (PRD 133 / TRD 35)**. D-018 repeats the wrong total.
- Table counts contradict within one file: 51 / 68 / 55 vs **56** actual; "9 views" vs **12**.
- JOBS-01 says "three pg_cron jobs"; `0013:499-509` schedules **five**.
- `BACKEND_ARCHITECTURE.md:4` lists 5 Edge Functions; `supabase/functions/` is **empty** — drift is 5×, DOC-01 flags only 1.
- `DATABASE_ARCHITECTURE.md:7` pins migration order ending at `0009_triggers`; actual `0009` is `0009_auth.sql`, and there are 28.
- OPEN_ITEMS GIT-01 says "13 unpushed commits"; there are **46**.
- **104 of 168 registry rows carry no status marker** despite the code plainly existing (PRD-HLTH-001..005, TRD-ENG-001/002, TRD-SEC-001, PRD-DISC-001..003 …).
- `RISK_REGISTER.md` — **all 14 risks still `OPEN`**, never re-reviewed across four milestones despite the doc's own milestone-exit rule.

---

## 6. Broken code

| Area | Defect | Evidence |
|---|---|---|
| Navigation | 3 of 4 bottom-nav tabs 404 | `bottom-nav.tsx:18-21` vs `app/[locale]/` — no `/journey`, `/prepare`, `/profile`; no `pathnames` map. `shell.spec.ts:24` asserts visibility, never navigation — which is why it passed |
| Data layer | Every DB failure renders as an empty state or a false 404 | `lib/knowledge.ts` 21 `.from()` calls, **0** `.error` checks; same in `journeys.ts`, `live.ts`, `record.ts`, `prepare.ts`. `journeys.ts:60-67` discards the error and `notFound()`s. This is the exact class of bug KNOW-04 already hit product-wide once |
| Change Card | Rungs c/d/e/f mislabelled; removals presented as reorders | `change-sheet.tsx:111-124` vs `change.ts:314,352,372,390` |
| Change Card | Low-confidence disclosure unreachable | `change-sheet.tsx:161-162` (`low_confidence`/`stale`) vs `health.ts:412,415` (`health.trust.unverified`/`conflicting`) |
| Engine | Cross-day leakage suppresses options | `change.ts:489` returns journey-wide state; an unrelated Broken day yields `options=0, recommended=null` |
| Engine | Return-guard breach marks **every** day Broken | `health.ts:233` runs over `allItems` inside each day |
| Engine | Time-load window ignores next FIXED item | `health.ts:132` |
| Engine | Availability tests start minute only | `health.ts:178-188` |
| Travel | Falls back to **0 minutes** | `schedule.ts:257-280`; nothing writes `travel_estimates`; `getRoutingProvider()` zero callers |
| Deploy | `main` cannot deploy | `check:bundle` exit 1, `/design-system` 513.8 kB |
| Ops | 6 pages have no error state | `media`, `guidance`, `publish`, `transport` (`:22-28` discards error) + 3 `new/` pages |

## 6b. Incomplete, duplicate and unused code

- **`packages/db/src/ai-store.ts` — fully dead.** Exported as a package subpath, **zero importers**, no test. Its consumers were never instantiated because `/api/intent/extract` was never built.
- **62 shadcn preset components** in `packages/ui/src/components/ui/` imported by exactly one non-production surface (`app/design-system/_parts/*`). No app route uses any.
- **4 name-level duplicates** — `alert/button/input/label` exist in both `packages/ui/src/components/` and `.../components/ui/`; `index.ts` exports only the legacy set, so `@mandhira/ui`'s `Button` and the preset's `Button` are different components sharing a name.
- **`packages/config/tailwind/shadcn-bridge.css` orphaned** — out of the import chain, retained only so a 59-assertion test can read it off disk. A green test guarding a file nothing loads.
- **3 near-identical Ops table components** + `displayName` duplicated 4×: `entity-table.tsx:89`, `places-table.tsx:19`, `destinations-table.tsx:20`, `lib/destinations.ts:4`.
- **Stale comment** `packages/ui/src/index.ts` claims "no speculative abstractions" one directory above 62 unreferenced components.
- **Stale UI copy** `source-form.tsx:236` tells operators monitoring doesn't exist, beside the select that configures it.
- **Stale code comment** `apps/web/lib/api.ts:34` says the device cookie is unset; `middleware.ts:80` sets it.

**Hygiene is otherwise exceptional:** TODO 0 · FIXME 0 · HACK 0 · XXX 0 · "not implemented" 0 · "coming soon" 0 · `@ts-ignore` 0 · `@ts-expect-error` 0 · 1 `any` (documented, D-048) · 3 `eslint-disable` (all justified inline) · **no mock/stub/placeholder data in any production path**.

---

## 7. Security, database, API, UI/UX, performance and testing gaps

### 7.1 Security

| ID | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| S-1 | **Critical** | Publish gate bypassable — blanket UPDATE with no status guard; no trigger, no CHECK. Skips validation, four-eyes, `record_audit`, `record_knowledge_update`. For `destinations`/`routes`/`guidance_blocks`/`phrases`/`advisories` there is no view-level trust gate either, so unreviewed content reaches travelers | `0008:156-163`; claims to the contrary at `0011:6`, `0026:283` | BEFORE UPDATE trigger rejecting transition to `published` unless set by `publish_entity()` |
| S-2 | **High** | `anon` can enumerate draft UUIDs then read draft content. `entity_media` anon SELECT `using (true)` carries `(entity_table, entity_id)` for drafts → `entity_trust()` (definer, anon) → `accessibility_for()` (definer, anon, **no publish check at all**, returns free-text `notes_i18n`) → `media_assets` → `storage_path` in the **public** bucket | `0008:285-287`, `0014:122`, `0015:160` (verified: function selects straight from `accessibility_records`) | Add publish checks to both definers; restrict `entity_media` to published parents |
| S-3 | **High** | No audit trigger exists. `audit_log` has 2 write sites. Unaudited: `trust_records` (decides traveler visibility), `user_roles` (privilege grants), `sources`, `review_tasks`, `media_assets`, `feature_flags`, `user_reports`, all 5 pipeline tables | `0011:280`, `0026:246` only | Generic audit trigger across Ops-written tables |
| S-4 | Medium | `record_audit()` granted to **all** `authenticated` — any traveler can pollute the append-only trail (`actor_user_id` is session-pinned, so no impersonation). `validate_for_publish` likewise a definer oracle for any entity id | `0011:290-291` | Restrict EXECUTE to ops roles |
| S-5 | Medium | `service_role` holds full DML on `traveler_profiles` (loop with no exclusion, extended to future tables). No Ops code reads it today, and pgTAP never tests `service_role` denial. AUTHORIZATION_MODEL claims a "CI grep test" that **does not exist** | `0025:61-71,101-102`; `ci.yml` | Exclude the table; add the grep gate |
| S-6 | Medium | `v_published_live_conditions` filters on `is_enabled` only — no publish/verification status — and exposes `affects_entity_ids` to `anon` | `0023:21-45,61` | Gate + drop the column |
| S-7 | Medium | CSP ships `script-src 'unsafe-inline'` in production | `security-headers.mjs:57` (D-114) | Nonces at M2 |
| S-8 | Medium | 2 server actions bypass `opsAction`; Ops actions have **no rate limiting at all** (30+ addressable POST endpoints, incl. `runIngestion` which triggers outbound fetches) | `publish/actions.ts:108`, `trust/actions.ts:120`, `lib/action.ts:32-113` | Wrap + add limits |
| S-9 | Low | `knowledge_updates` exposes Ops staff `published_by` to every traveler | `0026:58-59` | Drop from the policy projection |
| S-10 | Low | `publish_entity` is SECURITY INVOKER with unpinned `search_path`, uses `execute format()`. Not exploitable (PG17 + PostgREST pinning + allowlist) but inconsistent with the other 32 | `0026:205-208` | Pin it; `revoke create on schema public from public` |
| S-11 | Low | Seed ships fixed-password local admin (local-only; `deploy.yml` pushes migrations only) | `seed/0001:25` | Acceptable |
| — | ✅ | **Clean:** no secret ever entered git history (verified across all history); `.env*` properly ignored; RLS on 56/56 tables; **32/32 definer functions pin `search_path`**; TRUNCATE revoked (`0022`); limiter service-role-only and fails closed; share tokens 32-byte/expiring/revocable; `traveler_profiles` unreferenced anywhere in `apps/ops` | | |

### 7.2 Database

- Schema is **complete against TRD §4** — no spec'd table missing. Migrations strictly additive; zero `DROP`; only 2 structural ALTERs, both `if not exists`.
- `entity_versions` missing on 8 tables TRD §4.3 implies: `media_assets`, `entity_media`, `travel_estimates`, `circuit_destinations`, `destination_links`, `route_places`, `live_feed_configs`, `live_feed_readings`.
- `validate_for_publish` has **no `availability_rules` branch** (`0011:92` falls through to empty) — whole-entity availability trust is checked at read time but never at publish time.
- `ip_hash` column exists; **nothing writes it** (TRD §6.1 specifies SHA-256 + daily salt).
- Undocumented drift: `v_published_live_conditions` has no DECISION_LOG entry; `prune_ai_cache` / `prune_rate_limits` in neither TRD nor log.
- `disputed` sorts above `verified` in the enum, so `>= human_reviewed` admits it — as literally specified, and reasoned at `0007:87-92`, but the ordering is a trap for future code.

### 7.3 API

10 TRD routes missing, 6 divergent, all 16 Ops routes replaced by Server Actions without a logged decision. `withApi` is well-built (validate→auth→authorize→rate-limit→envelope, no stack leak) but its `roles` option is used by zero routes. `journeys_write` is used as a catch-all on reads, so a snapshot refresh burns the journey-edit budget. One low-severity leak: `cron/feeds/route.ts:118` returns raw Postgres messages (requires `CRON_SECRET`).

### 7.4 UI/UX & accessibility

- **Zero loading states repo-wide** — no `loading.tsx`, no `Suspense`. Deliberate (D-101: a `loading.tsx` forces streaming and breaks `notFound()`/`redirect()` codes) and the trade-off is real, but no route has any affordance on a slow network, on a product whose device floor is a ₹10–15k Android on 4G.
- **Error states**: web data layer has none (§6); 6 Ops pages have none.
- **44 px target-size regression** from the D-148 preset (32/36 px buttons, `rounded-none`) — a stated WCAG 2.2 AA requirement in both PRD §12.8 and CLAUDE.md §4.
- **3 systematic contrast failures** in the preset's `mist` palette, replacing a palette where all 47 pairs were verified AA (D-025).
- **No `aria-live` anywhere** (0 occurrences) — the Live countdown and health transitions are never announced. No `aria-describedby`, no skip link, **no `eslint-plugin-jsx-a11y`**.
- 4 known preset component defects (Slider unlabelled thumbs, Combobox trigger without accessible name, ItemGroup/CommandList role mismatch, non-focusable scroll containers).
- **Strong:** icon+text on every status component, unit-asserted; axe across 14 e2e specs with **no exception list**; 200% text-scale and dark-mode specs; PRD §12.7 copy enforced by a scanner that was verified by breaking it.

### 7.5 Performance

Budget script is real and wired into deploy — and **currently failing**. No Lighthouse run (needs deployment). Health recompute measured only on localhost (p50 119 ms / p95 199 ms) against a ≤500 ms p95 target; no benchmark in the engine package. No provider cost/quota alerting (TRD §10 asks for 70% alerts). Web Worker offload exists but its bundling path is unexercised (OPEN-010).

### 7.6 Testing

**Strengths:** 686 unit tests green; engine 99.68%/91.84%/100%/99.68%; 620 pgTAP assertions including an anon-policy allowlist test and an owner-scope test for every `traveler_profiles` policy; axe with no exceptions.

**Gaps:**
- **e2e never runs in CI** — 219 cases execute only on a developer machine; last recorded pass 2026-08-26, two commits stale, both touching shared UI.
- **1 route test for 23 route files.** Authorization and tier-rule refusals are untested at route level despite a comment claiming otherwise.
- No pgTAP test asserting definer functions pin `search_path` (property holds; nothing would catch the first regression).
- No test for S-1 (because the bypass works), S-2, or S-3.
- `entity_trust` has **zero** test references although D-078 names `0013_traveler_read_surface_test` as its guard — that file contains no draft assertion.
- `format:check` and `check:bundle` ungated on PRs (which is how `/design-system` reached `main`).
- TEST-01 (e2e rate-limit ceiling), TEST-02 (ingestion seam) both open.

---

## 8. Dependencies & blockers

```
GIT-01 (push credentials)
  └─> CI execution ─> B-025 deploy ─> Lighthouse, prod verification, pilot
OPEN-001 (launch destination)
  └─> B-013 seed ─> B-015 completion ─> B-018 ─> B-032 embeddings ─> PERS-01/02
ACCT-04 (Gemini) ─> /api/intent/extract, A07/A08, F17c AI extraction ─> OPEN-014 auto-conflicts
ACCT-01 (Resend) ─> production sign-in ─> pilot (OPEN-007)
ACCT-03 (MapTiler) ─> MAPS-02 ─> Live practical chips
OPEN-002 (transport provider) ─> PRD-DYN-005
OPEN-014 (claims schema) ─> PRD-OPS-SRC-005
```

**Critical path to a shippable M1:** GIT-01 → CI green → fix S-1/F6/nav/bundle → OPEN-001 → B-013 → ACCT-01 → deploy → pilot.

**Nothing blocks** any item in §4.2 or §4.3 — roughly 30 defects and features are buildable today with no founder input.

---

## 9. Step-by-step execution plan to 100%

### Phase 0 — Unblock and stop the bleeding (1–2 days)
1. Resolve **GIT-01**; push all 46 commits; confirm CI goes green (first ever run — expect surprises in `supabase/setup-cli` and the types-drift diff).
2. Fix `/design-system` bundle budget so `deploy.yml` can promote.
3. Add `check:bundle` and `format:check` to `ci.yml`.
4. Add the Playwright suite to CI (it is the only thing that would have caught the nav 404s).

### Phase 1 — Security & correctness (3–5 days)
5. S-1 publish-status trigger **+ a pgTAP test that proves the direct UPDATE is refused**.
6. S-2 publish checks in `accessibility_for` / `entity_trust`; narrow `entity_media`; pgTAP for draft invisibility to `anon`.
7. S-3 generic audit trigger across Ops-written tables; pgTAP asserting a trust-record change is audited.
8. S-4/S-5/S-6/S-8 — grants, `service_role` exclusion, live-conditions gate, `opsAction` wrapping + rate limits.
9. F6 Change Card: render engine `labelKey`/`becauseKey`; fix the trust-key mismatch; add before/after times.
10. Fix bottom-nav 404s; add `.error` handling across the web data layer.
11. Wire `getRoutingProvider()` and populate `travel_estimates`; add `GET /api/travel-estimate`.
12. Engine: time-load sub-window, availability end-minute, return-guard day attribution, cross-day option leakage.

### Phase 2 — Close P0 spec gaps (5–8 days)
13. O11 Verify queue; O20 Audit log + version restore; O21 Users & roles.
14. PRD-DISC-004 "Add to journey" + tier picker; A12 health sheet; A23 Profile & Travelers (with DPDP export/delete).
15. Publish queue: all 8 entity types. O01 knowledge-health dashboard from existing SQL.
16. Reconcile TRD §5.2/§5.3 — add missing routes or log the divergence per CLAUDE.md §2.
17. Route-level authz tests; engine benchmark; `aria-live`; `eslint-plugin-jsx-a11y`.

### Phase 3 — Documentation truth pass (1 day)
18. Fix `README.md:5,41`; the three blanket false headers; the registry total (168/146); table and view counts; JOBS-01 job count; `BACKEND_ARCHITECTURE.md` Edge Functions; `DATABASE_ARCHITECTURE.md` migration list; GIT-01's commit count.
19. Mark the 104 unmarked registry rows; **downgrade PRD-DSGN-001/006** to reflect D-148.
20. Re-review all 14 risks in `RISK_REGISTER.md`.
21. Re-establish PROJECT_STATUS at FEATURE_INVENTORY granularity (CLAUDE.md §3).
22. Write the 8 missing plan files retroactively, or record a decision that they are waived.

### Phase 4 — Design system decision (3–5 days)
23. Decide: migrate the 45 routes onto the preset, or revert. Either way **fix the 44 px regression and the 3 contrast failures before the PWA reaches a phone** — both are stated AA requirements.
24. Remove or justify the 62 unreferenced components; resolve the 4 duplicate names; delete `ai-store.ts` or wire it; unorphan `shadcn-bridge.css`.

### Phase 5 — Content & AI unblock (founder-gated)
25. OPEN-001 → B-013 seed destination through the gate. 26. ACCT-04 → `/api/intent/extract`, A07/A08, F17c, then OPEN-014. 27. ACCT-01 → deploy → OPEN-007 pilot.

### Phase 6 — M4 completion
28. B-034 i18n pipeline + te/hi (the largest single remaining body of work — ~261 hardcoded strings, 2 empty catalogs, 34 engine keys with no catalog). 29. B-035 phrase packs + audio. 30. B-037 dashboards, advisories, report photos, DPDP jobs. 31. B-032 embeddings. 32. PERS-01/02.

### Phase 7 — M5 growth
33. B-038+ per PRD §9 Phase 5.

---

## 10. Master implementation plan

| Phase | Tasks | Dependencies | Priority | Complexity | Definition of Done |
|---|---|---|---|---|---|
| **P0 — Unblock** | GIT-01 push; fix bundle budget; add `check:bundle`/`format:check`/e2e to CI | Founder (GIT-01) | **P0** | **S** (1–2 d) | CI green on a clean runner; `deploy.yml` verify job passes; e2e runs on every PR |
| **P1 — Security** | S-1 status trigger; S-2 anon exposure; S-3 audit triggers; S-4/5/6/8 | P0 for CI proof | **P0** | **M** (3–5 d) | Each fix has a pgTAP test that **fails without it**; direct `UPDATE … status='published'` refused; `anon` reads zero draft rows; a trust-record change writes `audit_log` |
| **P1b — Correctness** | Change Card labels + trust keys; nav 404s; `.error` handling; routing wiring; 4 engine defects | — | **P0** | **M** (3–5 d) | Every option's rendered text derives from engine keys; 4 nav tabs resolve; a forced DB error surfaces an error state; travel never silently 0; engine defects covered by tests |
| **P2 — P0 spec gaps** | O11, O20, O21, O01; DISC-004; A12; A23; publish queue completeness; API reconciliation | P1 | **P0** | **L** (5–8 d) | PRD-OPS-WF-002/008 demonstrably met; a traveler can add an experience from discovery; DPDP export/delete work; TRD §5 reconciled or logged |
| **P3 — Doc truth** | README, headers, counts, registry markers, DSGN downgrades, risk review, status granularity, missing plans | — | P1 | **S** (1 d) | No document contradicts the code; registry status matches audit; all 14 risks re-dated |
| **P4 — Design system** | Migrate-or-revert decision; 44 px; contrast; dead component cleanup | P0 | P1 | **L** (3–5 d) | axe clean at 390 px both themes; every target ≥44 px; zero unreferenced components in `packages/ui` |
| **P5 — Content & AI** | B-013 seed; intent extraction; F17c; OPEN-014; deploy; pilot | OPEN-001, ACCT-01/04 | **P0** | **L** | One destination published through the gate; ≥85% extraction accuracy, 0 hallucinated IDs; 10 pilot planners on a live URL |
| **P6 — M4** | B-034 i18n; B-035 phrases; B-037 dashboards/advisories/DPDP; B-032; PERS | P5 | P1 | **XL** (15–20 d) | te/hi ≥95% complete; zero hardcoded user-facing strings; Flow 8 passes |
| **P7 — M5** | Collaborative journeys, conversational assistant, circuits, tiles, partners, Expo | P6 | P2 | **XL** (30+ d) | Per-capability DoD + PRD §2 decision test |

**Estimated remaining effort to the complete product (M1–M4):** ≈ 40–50 focused days, of which ~12 are defect repair that did not appear in any plan, and ~20 are the i18n/M4 body of work. M5 adds 30+.

---

## 11. What this project does unusually well

Worth recording, because an audit that lists only faults misrepresents the codebase:

- **It reports conflicts instead of resolving them silently.** DOC-01, DOC-02, OPEN-009, OPEN-012, OPEN-013, OPEN-014, TEST-01, TEST-02 are all cases where the spec was ambiguous or wrong and the work stopped to say so with citations and a recommendation. That is CLAUDE.md §2 followed exactly, and it is rare.
- **It declares absence in-product rather than faking it.** `/ingestion` says AI extraction is unavailable; the Conflicts page explains manual raising; unbuilt nav entries carry `href:null` + a milestone. No page anywhere renders mock data.
- **The decision log is real engineering history** — 149 entries, several recording bugs found by the project's own tests (D-095 return guard, D-097 middleware 307s, D-125 silent notification writes, D-130 outbox drain, D-142 `service_role` holding no privileges).
- **Privacy boundaries are structural, not conventional.** `traveler_profiles` has no Ops policy at all; impact counts come back as four aggregate keys; the share projection cannot return profiles or notes; offline replanning deliberately omits profiles and says so in the card.
- **Zero debt markers and no committed secret in 46 commits.**

The gap in this project is not engineering care. It is that the **documentation layer stopped tracking the code**, and a handful of defects — most of them one-file fixes — sit in exactly the places where a traveler's trust is decided.
