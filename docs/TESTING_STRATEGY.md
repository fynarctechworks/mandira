# Testing Strategy

## Layers & tools
- **Unit (vitest):** `packages/journey-engine` (mandatory ≥90% coverage — CI gate), `packages/providers` fallbacks, `packages/db` Zod schemas, utils (i18n fallback, availability formatter, buffers).
- **Integration (vitest + Supabase local):** route handlers through `withApi` (validation, envelopes, rate limits), DB triggers (versions, audit, updated_at, report downgrade), publish-gate function, freshness computation.
- **RLS/authorization (SQL tests, run in CI against local Supabase):** for each table × role (anon/traveler A/traveler B/each ops role): expected allow/deny. IDOR cases: journey of another user, report of another user, traveler_profiles from ops role (must deny).
- **API contract:** Zod schemas double as contracts; snapshot the envelope shapes for TRD §5.2/§5.3 routes.
- **E2E (Playwright):** PRD Flows as specs — M1: Flow 1, 2(partial), 3 + airplane-mode (offline context) test; M2: Flows 4, 6; M3: 5, 7; M4: 8. Run smoke (Flow 1+3) on every PR against preview; full suite nightly.
- **Accessibility:** @axe-core/playwright on A02/A04/A06/A10/A14/A16 (+O10/O13 in M3): zero serious/critical; keyboard traversal of builder + sheets; 200% text-scale layout snapshots.
- **Performance:** Lighthouse CI (mobile, 4G throttle profile) budget: Perf ≥80, PWA installable, route JS ≤180 kB (bundle-analyzer diff check); engine benchmark test: computeHealth 60 items ≤500 ms.
- **Security tests:** service-role-key grep in client bundles; rate-limit 429 tests; share-token expiry; CSP header presence; publish-gate bypass attempt.
- **AI evaluation (not classic tests):** intent extraction against `tests/fixtures/intent/<locale>.jsonl` (50+ sentences/locale) — ≥85% field accuracy, 0 hallucinated IDs (hard fail); run on provider/model/prompt change, results logged in DECISION_LOG when model changes.
- **Regression:** full vitest + smoke on every PR; full E2E nightly and before any production deploy tagged release.
- **Manual QA (per milestone exit):** reference-device pass (₹10–15k Android, 4G) of the milestone's flows; copy review against PRD §12.7; dark-mode + te/hi visual pass (M4).

## Required testing by feature category
| Category | Required |
|---|---|
| Journey Engine change | Unit (incl. Appendix-A fixture + option-ladder matrix) + benchmark |
| New/changed route | Integration + authorization + contract |
| Schema/RLS change | RLS tests + trigger tests + `db reset` in CI |
| Ops workflow feature | Integration (gate/separation-of-duties) + E2E of the queue + audit assertion |
| Traveler screen | E2E of its flow + axe + states check (loading/empty/error) |
| Offline feature | Playwright offline-context test + reconcile assertion |
| AI feature | Eval fixture run + grounding unit tests (assertGrounded) |
| Notification/job | Idempotency test + schedule simulation |
