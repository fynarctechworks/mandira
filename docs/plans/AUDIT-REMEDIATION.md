# Plan — AUDIT-REMEDIATION (close every gap in docs/PROJECT_AUDIT.md)

**Authorization:** founder, in-conversation, 2026-09-13 — full approval to implement every
module (frontend, backend, SQL) end to end, using the adopted shadcn `base-lyra` preset
(D-148/D-149) for all UI. Per CLAUDE.md §2 the founder's instruction outranks the PRD.
Interpretation recorded as D-150: **visual design follows the preset, not PRD §12**; product
*safety* rules (publish gate, FIXED/PROTECTED invariants, explicit tap, trust disclosure,
privacy boundary) are kept, because the audit's findings are violations of exactly those.

**Branch:** `audit-remediation`. One commit per workstream, each with docs + status updated.

## Workstreams (executed in this order)

| ID | Workstream | Scope | Proof of done |
|---|---|---|---|
| R0 | Unblock | Bundle budget for the staff-only `/design-system` route; CI gains `format:check`, `check:bundle`, a privacy-boundary gate and the Playwright suite | `pnpm check:bundle` exits 0; CI workflow lints clean |
| R1 | Security | Migration `0029_security_hardening`: status guard trigger on all 9 publishable tables; `publish_entity` → SECURITY DEFINER with pinned search_path; generic Ops audit trigger + daily-salted `ip_hash`; version history on the missing tables; publish checks inside every anon-granted definer; `entity_media`/`media_assets` anon reads limited to published parents; `record_audit` revoked from clients; `validate_for_publish` Ops-only; `service_role` loses `traveler_profiles`; live-conditions view gated; `published_by` withheld. App: loaders moved out of `"use server"` files; `opsAction` rate-limited | pgTAP file where every assertion fails on the pre-0029 schema; full `supabase test db` green |
| R2 | Correctness | Change Card rendered from engine keys via one message catalog; trust-note keys; bottom-nav routes that exist; `.error` handling across the web data layer; routing provider wired with a `travel_estimates` cache write path; engine fixes (next-FIXED window, availability end minute, return-guard day attribution, per-day option evaluation, single-window rung d, empty days reported) | Unit tests for each defect fail before, pass after; engine coverage ≥90% |
| R3 | Ops platform | O11 Verify queue, O20 Audit log + version history + restore, O21 Users & roles, O01 Knowledge-health dashboard, publish queue for all 8 types (+ scheduled publish), source detail captures/diffs, O19 Advisories, feature flags, O22 Product signals, O17 Translation workspace, O18 Locales, media usage + crop presets, loading + error states everywhere, table deduplication | Every nav entry has an `href`; e2e per screen incl. role refusal |
| R4 | Traveler app | Add-to-journey + `POST /api/journeys/:id/items`; A12 health sheet + Simplify this day; A23 Profile & Travelers with DPDP export/delete; A22 Saved places; A01 Welcome & language; See all + remaining filters; `PATCH /api/journeys/:id`, `reorder`, `/api/search`, `/api/travel-estimate`, `/api/live/:destinationId`; aria-live; documents prepare group; offline leave-by in the worker | Route authz tests; e2e per flow |
| R5 | AI & automation | `/api/intent/extract` + A07/A08 (degrades to the structured form with no key); grounding enforced; "Mandhira summary" label; `ai_cache`/`ai_calls` stores wired; Ops AI extraction; conflict auto-detection using `conflicts.values` (resolves OPEN-014 without a claims table) | Provider tests with a fake model; no AI text reaches a knowledge table |
| R6 | Language | Every user-facing string in message catalogs; te/hi catalogs authored (flagged for native review, OPEN-004); locale switcher; engine key catalog; `ui_strings` export | Scanner test: no hardcoded user-facing string in `apps/web` |
| R7 | Providers & ops hygiene | Resend email adapter; error-reporting hook; central env validation; `.env.example` complete | Provider tests; preflight green locally |
| R8 | Design system | Traveler + Ops screens on preset components; coarse-pointer 44 px targets (keeps preset density on desktop, meets WCAG 2.2 on touch); contrast fixes; legacy duplicates removed | axe clean both themes at 390 px |
| R9 | Documentation truth | README, registry headers/totals/markers, status granularity, architecture docs, risk register, decision log | No doc contradicts the code |

## Progress log

### 2026-09-13
Verified locally unless marked otherwise. Committed checkpoint `f76cfd4`; the rest is on the branch awaiting integration.

- **R0** — CI gains `format:check` (vendored preset excluded, D-168), the privacy-boundary gate, `check:bundle` on PRs and a Playwright job; `/design-system` bundle allowance (D-163). Local Supabase requires CLI ≥ 2.117.
- **R1** — `0029` (S-1…S-10) and `0030`: client roles hold exactly the declared grants. The audit's premise that anon held no table grant was false on this Supabase image; fixed and pinned by catalogue tests (D-152–D-155). pgTAP `0030`, `0031`.
- **R2** — engine: FIXED-stretch time load, whole-visit availability, return guard on its day, every day reported, per-day option judgement with before/after times (D-156, D-157); Change Card and health text from the catalogs (D-158); travel routed and cached on every plan build (D-159); atomic `create_journey` (D-160, OPEN-012); web data layer throws on failed queries instead of rendering empty states.
- **R3/R4 SQL** — `0032` Ops admin surfaces (scheduled publish, restore, team, dashboards; D-162), `0033` traveler data rights (D-161). Screens are being built.
- **R5** — `extractKnowledge` / `suggestTranslation` with grounding in code; `0034` routes claims to review and opens conflicts automatically (D-164, OPEN-014). Wiring into ingestion follows the Ops screens.
- **R6** — engine keys, health and Change Card text in en/te/hi catalogs (te/hi machine-authored; OPEN-004 native review still required).
- **R7** — EmailProvider over Resend REST (D-167); vendor-SDK lint ban in the shared base, re-probed (D-166); `.env.example` completed.
- **R8** — preset contrast failures fixed in tokens and coarse-pointer 44 px targets (D-165), with a WCAG ratio test.
- **R9** — README, registry header and totals, inventory/backlog headers, backend and database architecture, risk register re-reviewed, GIT-01 count.
- **Engine tests added** — PRD-ADPT-008 matrix (50 journeys × 8 triggers) and PRD-PLAN-009 performance budget.

Counts at this point: pgTAP 633/633 (34 files); providers + UI vitest 313/313; full unit suite 766/766 before the latest additions.

## Out of reach from this machine (built to be ready, not claimed done)
GIT-01 push credentials · real provider keys (Gemini, Resend, MapTiler, ORS, Sentry) ·
production domain and deployment · pilot planners. Each code path works locally and
degrades honestly without its key.

## Risks
- Migration 0029 changes grants the traveler views depend on — mitigated by running the
  existing 620 pgTAP assertions plus the new file before any app work.
- View shape changes require a Dexie bump (CLAUDE.md §4) — `v_published_live_conditions` is
  not in the snapshot, so dropping `affects_entity_ids` needs no bump (verified: no reader).
