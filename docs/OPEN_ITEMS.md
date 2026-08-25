# Open Items — waiting on the founder

Living tracker for everything that development cannot resolve on its own: product decisions,
external accounts, and credentials. `PROJECT_READINESS_REPORT.md` is the point-in-time
snapshot; **this file is the current state**. Update it in the same commit as the work that
resolves or raises an item.

Status: `OPEN` · `RESOLVED` · `SUPERSEDED`

## Blocking now

> **B-013 (seed destination #1) is stopped on OPEN-001, and as of B-017 that is now the
> critical path.** Everything buildable without content has been built: B-014 (traveler
> shell + PWA) and B-016/B-017 (the whole journey engine) are done. B-015 needs B-013 and
> OPEN-009; B-018 needs B-015; B-019..B-025 chain off B-018. The parts of B-018 that need no
> content — the AI provider package, grounding, cache and rate limits — are now done; the
> brief-review and builder screens cannot be finished until there is a destination.

| ID | What's needed | Blocks | Why it can't be worked around |
|---|---|---|---|
| GIT-01 | **Push credentials for `fynarctechworks/mandira`.** The stored credential is for `stimuliIQ`, which has no write access. Either grant that account write access, or clear `git:https://github.com` from Windows Credential Manager and re-auth. | Every commit so far (8 unpushed); all CI | CI has never executed. Two workflow jobs and ~10 steps are unverified, including `supabase/setup-cli` on a clean runner and the generated-types staleness diff. |
| OPEN-001 | **Launch destination #1** (ideally #2–#3 too). Determines seed content, which sources to register, and the transport feed. | B-013 (seed content), and therefore B-015 discovery | Content cannot be researched or seeded without knowing the place. Everything up to B-012 builds the machinery that will hold it. |

## Blocking soon

| ID | What's needed | Blocks | Needed by |
|---|---|---|---|
| ACCT-01 | **Resend account + verified sending domain.** Supabase's built-in SMTP allows ~2 emails/hour, which is unusable for magic links. | Production/preview sign-in | Before any deploy (B-025). Local dev is unaffected — Mailpit catches mail. |
| ACCT-03 | **MapTiler key** (`NEXT_PUBLIC_MAPTILER_KEY`, free tier). The coordinate picker works without it (search + decimal degrees), but map confirmation of pins needs a tile source. | Map confirmation in the editors; B-020 mapping | Before B-020 |
| ACCT-04 | **Gemini API key** (`GOOGLE_GENERATIVE_AI_API_KEY`, free tier). The AI provider package, grounding, cache, log and rate limits are built and tested; no call has ever been made to a model. Optionally `ANTHROPIC_API_KEY` too — the fallback chain degrades to no fallback without it rather than erroring. | Live intent extraction (F3); the ≥85 % extraction-accuracy acceptance test | Before B-018 can be finished (also needs B-013 content) |
| ACCT-02 | **Google Cloud OAuth client** (client ID + secret). The provider is wired and config-ready but `enabled = false`. | "Continue with Google" in both apps | Before B-025. Magic link works without it. |
| OPEN-009 | **Traveler access to accessibility, route-stop, circuit and destination-link data.** TRD §4.4 defines 9 published views; none covers `accessibility_records`, `route_places`, `circuits`, `destination_links` or `live_feed_readings` — yet PRD-DISC-003 requires accessibility icons on experience cards. Deny-by-default since B-006 (D-033). **Recommendation:** extend `v_published_places`/`v_published_experiences` with an accessibility jsonb rather than adding a tenth view. | B-015 (discovery), B-031 (live feeds) | Before B-015 |

## Not yet blocking

| ID | What's needed | Blocks | Needed by |
|---|---|---|---|
| OPEN-002 | Transport live-feed provider for the launch destination (may be "none available → curated only") | DYN-03 | M3 |
| OPEN-003 | Production domain purchase + name | Prod DNS | B-025 |
| OPEN-004 | Accept Gemini for te/hi after eval fixtures, or switch provider | Public launch | End of M2 |
| OPEN-005 | Confirm launch locales en/te/hi (assumption D-014) | LANG scope | Before M4 |
| OPEN-006 | Content sourcing stance: approach T1/T2 authorities for permission vs public-data-only | Ingestion scale | M2 |
| OPEN-007 | Pilot group source (≥10 planners) | M2 exit | During M1 |
| OPEN-011 | **Guests currently share one rate-limit bucket.** `withApi` keys a guest's limit on a device cookie that nothing sets yet — the guest draft that issues it is B-019. Harmless while no guest-facing rate-limited route exists; the moment one does, the first traveler to spend their ten intent extractions spends everyone's. Not keyed on IP by choice (TRD §6.2 keys on a session; DPDP treats an IP as personal data). | `/api/intent/extract` (B-018) must not ship before the cookie does | With B-019 |
| DOC-01 | **`BACKEND_ARCHITECTURE.md` lists `keepalive` among the Supabase Edge Functions, while TRD §5.4 assigns it to Vercel Cron.** Implemented per the TRD (D-072), which also happens to be the only one that can work — an Edge Function that pings Supabase runs on Supabase and cannot wake a paused project. Flagged rather than silently edited, since the docs are founder-owned. | Nothing — the code follows the TRD | Whenever the docs are next revised |
| OPEN-010 | The engine's Web Worker bundling is unexercised: `new URL("./engine.worker.ts", import.meta.url)` is only reached once a page calls the client. Routing, worker reuse and the main-thread fallback are unit-tested over a real Comlink endpoint; the bundler output is not. | Nothing today | Verify during B-019, when the journey builder first calls it |

## Resolved

| ID | Resolution |
|---|---|
| OPEN-008 | **RESOLVED 2026-08-25 (D-025).** Founder delegated ("do the best"). §12.1 light palette revised so all 47 pairs meet AA in both modes; `brand.primary` #FF660E unchanged. |

## What is NOT blocked

Everything through **B-012** builds Ops machinery and needs no founder input:
B-008 Ops shell · B-009 destination/place editors · B-010 remaining editors ·
B-011 trust panel + sources registry · B-012 validation and the publish workflow.

**B-014** (traveler shell + PWA) and **B-016/B-017** (the journey engine) were also
unblocked and are now done — the engine is pure TypeScript over types that already exist,
and needed no content at all.

The first genuinely blocked item is **B-013** (seed destination #1), which needs OPEN-001.
After it, the whole M1 traveler chain B-015 → B-018 → B-019 → B-020/B-021 → B-022 → B-025
waits behind it. The engine halves of **B-026** (`evaluateChange` / `applyOption`
and the option ladder) and **B-022** (`getNowNextLater`) have now been built early for the
same reason — they are pure, and they needed no content.

Every remaining item that renders anything to a traveler waits on OPEN-001, because there
is nothing to render. What is still buildable without it:

- ~~**B-027 infrastructure**~~ — done: notification scheduling in the engine and the Web Push
  adapter. What is left of B-027 needs B-019 (subscribe UI, in-app list) or B-025 (the two
  Edge Functions, which need a deployable Supabase project).
- ~~**pg_cron job wiring** (TRD §5.4)~~ — done: `0013` ships all three pg_cron jobs plus the
  jobs contract (`job_runs`, single-flight runner, `v_job_health`).
- ~~**`withApi`**~~ — done, along with the `keepalive` cron route.
- **`packages/db` Zod schemas for the remaining TRD entities**, and the Ops-side bound
  `withApi` instance, whenever Ops first needs a route handler rather than a Server Action.
