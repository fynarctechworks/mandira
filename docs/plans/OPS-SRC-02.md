# Feature Implementation Plan — OPS-SRC-02 Ingestion, captures, diffs, change candidates, Review queue

- **Related requirements:** PRD-OPS-SRC-002, PRD-OPS-SRC-004, PRD-OPS-WF-001 (and the wiring, not the answer, for PRD-OPS-SRC-003)
- **Backlog item:** B-029 · **Milestone:** M3
- **Objective:** Make a monitored source tell us when it has changed. A URL-monitored source is fetched on a cadence, its capture stored and hashed, diffed against the previous capture, and — when the diff removes the evidence a published field was verified against — a Change candidate is opened in the Review queue with that excerpt highlighted. Today an operator learns a temple's timing changed when a traveler reports it from the gate.

## The idea this plan turns on

PRD F17 says a change candidate appears "when a monitored source's capture diff touches an existing published field". Knowing *which field* a diff touched normally means AI extraction — which needs ACCT-04, which does not exist.

There is a deterministic answer sitting in the schema already. `trust_records` stores `evidence_excerpt`: the exact words an operator read when they verified a field, alongside `source_id`. So:

> **A published field's evidence disappearing from its own source is a change candidate.**

No inference, no model, no guess at the new value. `new_value` stays null; the operator sees the diff and the excerpt that vanished, which is exactly what PRD-OPS-SRC-004's acceptance asks for ("with the excerpt highlighted"). AI extraction, when a key exists, fills in the proposed value on top of the same row.

## Scope
- `CaptureProvider` in `packages/providers` — fetch a URL, reduce it to comparable text, hash it.
- Pure `diffCaptures()` and `detectChangeCandidates()` with unit tests.
- The runner: `ingestion_jobs` → `source_captures` (body in the private `captures` bucket) → diff → `change_candidates`.
- Manual run from a source's page (Server Action, `researcher`+).
- `GET /api/cron/ingest` — the scheduled half, honouring `refresh_cadence_days`.
- **O09 Ingestion & extraction** — runs per source with status, capture times and diffs.
- **O10 Review queue** — side-by-side proposed vs current with the excerpt; accept / edit & accept / reject with reason / request verification.
- Migration `0024`: storage policies for the `captures` bucket (it has none), and the two review helpers.
- **Added during implementation:** migration `0025` — `service_role` had no table privileges anywhere in `public`, which broke this feature and, it turned out, every other privileged write in the product (D-142).

## Out of scope
- **AI extraction's answer** (PRD-OPS-SRC-003) — blocked on ACCT-04. The `ai_extractions` table and the queue column exist and are read; nothing writes them until a key does. Declining honestly, as routing does without an ORS key (D-105).
- **Conflict detection** (PRD-OPS-SRC-005) and the Verify/Approve/Freshness/Impact queues — B-030.
- `api` and `file_upload` ingestion methods. `url_monitor` is the one PRD F17's acceptance names; the provider seam takes the others without a rewrite.
- Rendering a captured page. A capture is evidence, not a document to browse.

## Dependencies
- OPS-SRC-01 (sources registry) — COMPLETE (B-011).
- KNOW-03 publish gate + `trust_records` — COMPLETE.
- The five pipeline tables exist since `0002`, with Ops RLS since `0008`. **No new tables.**

## Existing functionality affected
- `apps/ops/app/(ops)/sources/[id]` gains a "Run now" control and a run history.
- `apps/ops/lib/nav.ts` — O09 and O10 stop being `comingIn: "M3"` and get hrefs.
- Nothing in the traveler app changes. A change candidate is an Ops artefact; a traveler sees nothing until somebody approves an edit through the publish gate.

## Database changes
`supabase/migrations/0024_ingestion.sql` and `0025_service_role_grants.sql`, additive only:
- Storage policies for `captures`: Ops reads, service-role writes, admin deletes. The bucket has existed since `0011` with **no policy at all**, so nothing could read or write it.
- `open_change_candidate()` — a `security definer` helper that inserts a candidate idempotently per (entity, field, capture), so a re-run of the same job does not open the same candidate twice.
- Index on `change_candidates (source_id, status)` for the queue's source filter.

## Backend/API changes
| Surface | Who | Notes |
|---|---|---|
| `runIngestion(sourceId)` Server Action | `researcher`/`editor`/`admin` | Manual run. RLS decides; the action is the second gate. |
| `GET /api/cron/ingest` (**Ops app**) | `CRON_SECRET` | Scheduled runs. Service-role, like the notification sender. Bounded batch. |
| Review decisions | `reviewer`/`editor`/`admin` | Server Actions on the queue. |

**Changed during implementation (D-141):** the cron route lives in the **Ops** app, not beside the traveler app's. The plan assumed one deployment; `deploy.yml` shows two separate Vercel projects, so `apps/ops` carries its own `vercel.json`. Ingestion reads Ops tables, writes Ops evidence and fills an Ops queue — none of it concerns a traveler, and the traveler app is the one under a 180 kB route budget. This forced `apps/ops/middleware.ts` to exempt `/api/cron`, or the session gate would 307 the job to sign-in and Vercel would record a success while nothing ran (D-097, again).

## Frontend changes
- `/ops/ingestion` (O09) — sources with `ingestion_method = url_monitor`, last run, last capture, whether the last diff changed anything, and "Run now". Empty state says plainly that no source is monitored yet, which is the true state today.
- `/ops/review` (O10) — open candidates, oldest first. Each row: entity and field, the current published value, the proposed value (or "not proposed — the evidence disappeared"), the excerpt, and the four actions. Rejecting requires a reason.
- Both are server components reading through `opsSupabase()`; every mutation is a Server Action.

## Permission changes
No new roles. The Review queue's actions are gated on `reviewer`/`editor`/`admin` in RLS (already), in the Server Action, and by the nav — three layers, per CLAUDE.md §4. **Accepting a candidate does not publish anything**, and does not write knowledge at all: `decide_change_candidate()` touches `change_candidates` and `review_tasks` and nothing else, and correcting the fact is a separate edit through `publish_entity()` (D-140). A queue that could publish would be the bypass CLAUDE.md §5 forbids.

## Integration changes
`CaptureProvider` is `fetch` with a timeout, a size cap and a declared user agent. It never follows a redirect to a different origin without recording it, and a failure writes a `failed` job rather than throwing — the same shape as the weather feed's `unavailable` reading (D-132), for the same reason: a job that silently skips looks identical to a source that has not changed.

## Files expected to change
`packages/providers/src/capture/{types,http,diff,index}.ts`, `apps/ops/lib/ingestion.ts`, `apps/ops/app/(ops)/ingestion/{page,actions}.tsx`, `apps/ops/app/(ops)/review/{page,actions}.tsx`, `apps/ops/components/review-queue.tsx`, `apps/ops/lib/nav.ts`, `apps/ops/app/(ops)/sources/[id]/*`, `apps/ops/app/api/cron/ingest/route.ts`, `apps/ops/middleware.ts`, `apps/ops/vercel.json`, `apps/ops/components/{source-form,ingestion-runs}.tsx`, `supabase/migrations/{0024_ingestion,0025_service_role_grants}.sql`, `supabase/tests/{0025_ingestion_test,0026_service_role_test}.sql`, `tests/e2e/ops/ingestion.spec.ts`, and — because their failures were being swallowed — `apps/web/lib/notifications.ts` and `apps/web/app/api/cron/feeds/route.ts`.

## Risks
1. **A queue that edits knowledge.** The single most dangerous thing here. Accepting a candidate must route through the draft + publish gate, never write a published value. Asserted in pgTAP by attempting exactly that as a reviewer.
2. **Noise.** A source whose page carries a timestamp or a rotating banner would raise a candidate every cycle and the queue would be abandoned within a week. Mitigated by normalising the capture (strip scripts/styles, collapse whitespace) and by keying detection on *evidence excerpts* rather than on any diff at all.
3. **Fetching arbitrary URLs from a server.** SSRF. Mitigated by refusing non-http(s) schemes, private and loopback address ranges, and a redirect that leaves the original host.

## Edge cases
- **First ever capture** — nothing to diff against; store it, raise nothing.
- **Identical capture** — same `content_hash`; record the run, store no second body, raise nothing.
- **Source with no trust records** — captures accumulate, no candidates. Correct: nothing published cites it yet.
- **Excerpt is null or blank** on a trust record — cannot be checked; skipped, and the queue says how many were skipped rather than implying full coverage.
- **The same evidence disappears twice** — one open candidate, not two.
- **Fetch fails / times out / returns 404** — `failed` job with the reason, previous capture untouched.
- **A source retired mid-cycle** — not fetched. Retired means stopped trusting, not stopped watching quietly.

## Testing strategy
- **vitest** — `diffCaptures` (added/removed/unchanged, empty either side), normalisation (scripts, whitespace, entities), `detectChangeCandidates` (excerpt gone / still present / blank / already open), and the SSRF guard's refusals.
- **pgTAP `0024`** — `captures` is unreadable by anon and by a traveler; a `support`-role operator cannot write a candidate; **a reviewer cannot publish through the queue**; the idempotency of `open_change_candidate()`.
- **E2E** — a run against a **local fixture URL**, then the same URL changed, producing a candidate in the Review queue with its excerpt; accept and reject paths; axe on both new screens.

## Acceptance criteria
- [x] PRD-OPS-SRC-002 — a run stores a raw capture with a timestamp and a diff against the previous capture.
- [x] PRD-OPS-SRC-004 — a URL-monitored source whose timing text changes produces a Change candidate within one cycle, with the excerpt highlighted.
- [x] PRD-OPS-WF-001 — the Review queue shows proposed vs current with the excerpt, and offers accept / edit & accept / reject with reason / request verification.

## What the tests reach, and what they do not

Stated plainly because the honest answer is not "everything".

| Seam | Covered by |
|---|---|
| Fetch, normalise, hash, SSRF refusals | 35 vitest in `packages/providers/src/capture` |
| Diff, and detection from an excerpt | the same file, including the noise cases |
| Candidate idempotency, permissions, **cannot publish** | pgTAP `0025` (19) |
| `service_role` can actually write | pgTAP `0026` (15) |
| Both screens, the four actions, the required reason, axe | 9 E2E |
| A run that fails is recorded rather than silent | E2E, against an unresolvable host |

**The one seam nothing exercises end to end** is fetched-text → detection input: three lines inside `runIngestionForSource`. An E2E cannot reach it, because the capture provider refuses loopback and private addresses and relaxing that guard for a test is the "temporarily" CLAUDE.md §5 forbids. The provider is injectable so a future test can drive the runner with a stub; recorded rather than implied away.

## Found while building this
1. **The source form hardcoded `ingestion_method: "manual"`**, so no source could ever be watched however well the pipeline behaved. The form now offers it, and `api`/`file_upload` are deliberately still absent.
2. **`service_role` had no table privileges anywhere** — every privileged write in the product had been silently failing (D-142, migration `0025`).
3. **pgTAP defines its own `has_role(name) returns text`**, so `has_role('admin')` in a policy binds to the wrong function and fails to compile — but only on databases where pgTAP is installed. The enum cast is now explicit.
4. **A `<label>` wrapping a `<select>` folds option text into the control's accessible name**, so an option reading "Watch the URL" made every `getByLabel("URL")` ambiguous — for the test suite and for a screen reader user.

## Rollback considerations
Additive migration; the policies and helper can be dropped without touching data. The cron entry is one line of `vercel.json`. Removing the two nav entries makes the feature unreachable. No traveler-facing surface changes at all, so a rollback cannot affect anyone mid-journey.
