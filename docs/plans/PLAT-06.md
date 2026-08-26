# Feature Implementation Plan — PLAT-06 Quality pass (B-024)

- **Backlog item:** B-024 · **Milestone:** M1 (Day 19)
- **Requirements:** PRD-DSGN-005, PRD-DSGN-006, TRD-PERF-001, PRD-ANLY-001, TRD §6.1 (CSP)

## 1. What TRD §11.2 Day 19 actually asks for

> axe on A02/A04/A06/A10/A14/A16; keyboard and screen-reader labels; 200 % text scale; dark
> mode check; Lighthouse on reference device profile; bundle analysis to ≤180 kB; Sentry in
> both apps; `analytics_events` with allowlist; copy review against PRD §12.7.

## 2. Repository analysis — what is missing

| Piece | State |
|---|---|
| axe at WCAG 2.2 AA on every screen | **Done throughout** — every feature commit since B-014 added one. What is missing is 200 % text scale and dark mode. |
| `analytics_events` table + RLS | Exists (`0005`, `0008`). **Nothing writes to it**, and there is no route. |
| `withApi`'s `onUnexpected` hook | Exists, logs to console with a "Sentry is wired in B-024" note. |
| **CSP and security headers** | **Absent from both apps.** TRD §6.1 line 401 specifies them. This is a live gap, not a polish item. |
| Bundle budget | Never measured. |
| Copy review | Never automated; PRD §12.7's ban list is checked by eye, per feature. |

## 3. Scope, in value order

1. **Security headers, both apps.** CSP, HSTS, frame-ancestors, referrer policy, permissions
   policy. Written from TRD §6.1's own directive list.
2. **Analytics: allowlist + `POST /api/analytics`.** PRD-ANLY-001's acceptance is "zero user
   identifiers, **schema-tested**", so the allowlist is enforced in code AND the absence of
   identifiers is asserted in pgTAP against the table itself.
3. **Copy review, automated.** PRD §12.7's forbidden vocabulary as a test over the app's
   user-facing strings, not a one-off read-through. A ban list checked by eye holds until
   the next person writes a string.
4. **Sentry.** Wired behind an abstraction so it is a no-op without a DSN.
5. **Bundle budget ≤180 kB**, measured and recorded.
6. **200 % text scale and dark mode** added to the axe sweep.

## 4. The judgement calls

**(a) Sentry's package is not installed.** `@sentry/nextjs` is heavy, and this item's own
budget is ≤180 kB of route JS. Installing it to sit inert without a DSN spends that budget
on nothing — and the DSN is founder-owned (raised as **ACCT-06**).

**Recommendation, and what is implemented:** the reporting SEAM is built and wired into
`onUnexpected` in both apps, with a console transport today. Swapping in Sentry is then
adding one adapter, not threading a new call through every route. The TRD asks for "Sentry
in both apps"; what both apps need is somewhere for an unexpected failure to GO, and that is
what ships. Flagged rather than silently skipped.

**(b) Lighthouse on a reference device is not automatable here.** It needs a stable
device profile and a deployed URL; localhost numbers on this machine would measure the
machine. **Recommendation:** measure bundle size (which is deterministic and belongs to the
code) now, and take Lighthouse at **B-025** against the deployed app, where the number means
something. This matches how PRD-PLAN-009 was handled in B-019.

**(c) A CSP that breaks the app is worse than none.** Next injects inline scripts and styles;
a strict `script-src 'self'` alone will not boot. *Mitigation:* the policy is written to what
this app actually loads, and the E2E suite is the check — 155 tests exercising every screen
will fail loudly if a directive is too tight.

## 5. Testing strategy

- **Playwright:** headers present on real responses; every screen still works under the CSP
  (the existing suite is the regression net); 200 % text scale; dark mode axe pass.
- **Vitest:** the analytics allowlist rejects unknown names and strips unknown properties;
  the copy scanner over the repo's user-facing strings.
- **pgTAP:** `analytics_events` has no user column and no policy that could read one; a
  traveler cannot read the table back.

## 6. Acceptance criteria

- [x] CSP and security headers on every response in both apps, and nothing breaks under them.
- [x] `POST /api/analytics` accepts allowlisted events only, strips unknown properties.
- [x] **No user identifier can reach `analytics_events`** — asserted in pgTAP.
- [x] A forbidden §12.7 word in a user-facing string fails a test.
- [x] Unexpected route failures reach a reporter in both apps.
- [x] Route JS measured against the 180 kB budget — and now **checked on every build**.
- [x] axe clean at 200 % text scale and in dark mode.

## 7. What the pass actually found

A quality pass earns its place by what it catches. Four things, three of them live.

**1 — `anon` could TRUNCATE all 68 tables.** Supabase's platform defaults grant ALL on
`public` to `anon` and `authenticated`, and these migrations granted deliberately on top
without ever revoking what came free. **RLS does not apply to TRUNCATE**: every guarantee
this schema makes is about SELECT/INSERT/UPDATE/DELETE, and one TRUNCATE empties the table
regardless — including `trust_records`, which the entire publish gate rests on. Not
reachable through PostgREST today, which is exactly why it needed fixing: that answer
depends on facts about the API layer rather than about the database. Migration `0022`.

**2 — The four most prominent buttons had no text colour.** `text-brand-primary-on` is not
a defined utility — the token is `text-text-on-primary` — so Tailwind emitted nothing and
the label inherited `--text-primary` from `html`. In light mode that happens to pass
contrast; in dark mode it fails. "Plan a journey", the journeys empty state, the plan
submit and search have been like this since B-014. Found by the dark-mode axe sweep this
item added, which is precisely the sweep nobody had run.

**3 — Four routes were over the perf budget, one by 44 kB.** `sign-in` was 224 kB because
`@supabase/ssr` was statically imported into a form with one text field. Dexie put the
journeys list, the plan preview and Live over as well. Both are needed only after an
interaction, so both are now dynamic imports: sign-in 224 → 152.7 kB, journeys and preview
191 → 156.8 kB, Live 212 → 177.4 kB. **Every route is now inside 180 kB with no
exemptions.**

**4 — Turbo replayed a `.next` build for a `.next-e2e` request.** `NEXT_DIST_DIR` was not
in the cache key, so the build "succeeded", the directory was never written, and Playwright
failed with "Could not find a production build" — pointing nowhere near the cause. Fixed in
`turbo.json`, along with `NODE_ENV` and the Supabase URL, which are baked into the client
bundle and the CSP.

## 8. Verification note (step 9)

| Criterion | How checked |
|---|---|
| Security headers | E2E reads them off a real response, not the config. CSP asserted to contain `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`. |
| CSP does not break the app | Console watched for violations across four screens, plus the existing 165-test suite as the regression net. A policy that breaks the app is worse than none. |
| Analytics privacy | 12 vitest on the allowlist (an unknown property is dropped, and the serialised row contains none of the smuggled values); pgTAP asserts the table has no column able to hold a person, and that `anon` can INSERT but has no SELECT grant at all — write-only from the public side. |
| Copy | Scanner **verified by breaking it**: inserting a banned word and an exclamation mark fails both checks, and passes on revert. |
| 200 % text | axe clean on four screens at 32 px root, and no horizontal scroll — text reflowed rather than pushed off-screen. |
| Dark mode | axe clean on four screens after fixing finding 2. |
| Reduced motion | `--duration-state` collapses to zero under `prefers-reduced-motion` (PRD §12.6). |
| Bundle budget | `pnpm check:bundle` reads Next's own manifest and gzips, so the number means the same thing as the budget. 23 routes, largest 177.4 kB, **no allowances**. |
| Gates | lint 7/7 · typecheck 7/7 · **616 vitest** · **393 pgTAP** · **165 Playwright** · build 2/2. |

## 9. Deferred, with reasons

- **Lighthouse on a reference device** — needs a stable device profile and a deployed URL;
  localhost numbers here would measure this machine. Taken at **B-025**, same as
  PRD-PLAN-009's re-measure.
- **`@sentry/nextjs`** — the seam is built and wired; the package waits for a DSN
  (**ACCT-06**). See D-117 for why installing it early would spend the budget on nothing.
- **CSP nonces** — M2. D-114 records the trade: nonces need middleware, and this app's
  middleware runs on every request, so it would make every response uncacheable.
- **Ops `withApi` reporting** — Ops has no route handlers yet; its error boundary reports
  through the same seam.
