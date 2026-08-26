# Feature Implementation Plan — OFFL-01 Core offline (B-023)

- **Backlog item:** B-023 · **Milestone:** M1 (Day 18)
- **Feature IDs:** OFFL-01..03
- **Requirements:** PRD-OFFL-001, 002, 003, 007; TRD-ARCH-002, TRD-ARCH-005

## 1. Requirement review

| ID | What it demands |
|---|---|
| PRD-OFFL-001 | Auto snapshot on create / edit / open: the journey, every referenced place, experience, route and facility, their guidance, phrase packs, facility essentials. |
| PRD-OFFL-002 | Offline read set: **Live Journey fully**, Prepare, saved pages, trust sheets. Indicator says "Offline — using saved information (as of …)". |
| PRD-OFFL-003 | Reconnect: **silent** sync. One "updated while you were offline" card when the active journey is affected. **No sync-error dialogs, ever.** User edits last-write-wins; knowledge server-wins. |
| PRD-OFFL-007 | Airplane mode: a full 3-day journey readable; reconcile ≤30 s; zero loss. |
| TRD-ARCH-002 | `KnowledgeBundle` input **= the Dexie snapshot byte-for-byte**; engine identical in browser and server. |
| TRD-ARCH-005 | Dexie-first + revalidate. |

## 2. Repository analysis

| Piece | Where | State |
|---|---|---|
| `ConnectionBanner` — heartbeat-backed, already distrusts `navigator.onLine` | `components/connection-banner.tsx` | Exists (B-014) |
| Serwist service worker, never force-reloads | `app/sw.ts` | Exists (B-014) |
| Pure engine + browser worker wrapper | `packages/journey-engine`, `lib/engine` | Exists |
| `getKnowledgeBundle`, `getJourney`, `getPrepareChecklist`, `getLiveView` | `lib/*.ts` | Exist |
| Dexie | — | **Not installed.** TRD §3 names `dexie@4`, so adding it follows the TRD rather than expanding it. |

## 3. Conflicts and deviations — reported, not resolved silently

**(a) CONFLICT: what `KnowledgeBundle` contains.** This one matters here specifically,
because TRD-ARCH-002 makes the bundle and the Dexie snapshot the same bytes — so its
field list *is* the schema.

- **TRD §5.1 (line 313):** `{ places, experiences, availability_rules, routes, transport_connections, guidance_blocks, trust }`
- **Implemented** (`packages/journey-engine/src/types.ts`, shipped B-016/017): `{ places, experiences, availability_rules, routes, transport_connections, travel_estimates?, trust? }`

Two differences: the TRD has `guidance_blocks` the code lacks; the code has
`travel_estimates` the TRD lacks.

**Recommendation — the code is right and the TRD line is stale, for both halves.**
`travel_estimates` is load-bearing: MAPS-01 caches travel times there and `travelMinutes`
reads them, so removing it would break scheduling. `guidance_blocks` should *not* be in the
bundle: guidance is prose a traveler reads, not an input the engine schedules from, and
`KnowledgeBundle` is defined as the engine's input. PRD-OFFL-001 does require guidance
offline — so it belongs in the Dexie **snapshot**, which is a superset of the bundle, not in
the bundle itself.

That distinction is the fix: TRD §5.1 conflates "what the engine needs" with "what the
snapshot holds". Proceeding on the recommendation and logging **DOC-02** for the TRD edit.

**(b) DEVIATION: no TanStack Query.** FRONTEND_ARCHITECTURE §11.1 specifies it with a
sync-storage persister. Every traveler read page here is a server component (`force-dynamic`),
so adopting it would mean converting the read path to client components — a large rewrite
whose only offline gain is a second cache in front of Dexie.

FRONTEND_ARCHITECTURE §11.2 also names the thing that actually does the job:
`useOfflineFirst(queryKey, dexieRead, fetch)`. Implementing that directly against Dexie
satisfies TRD-ARCH-005's "Dexie-first + revalidate" with one cache instead of two.
**Recommendation:** implement `useOfflineFirst`; revisit TanStack Query only if a screen
needs it for something other than persistence. Logged for review.

**(c) The banner currently says the wrong "as of".** `ConnectionBanner` reports when the
*network* last answered. PRD-OFFL-002 asks when the *saved information* is from — a
traveler who has been offline for an hour but whose snapshot is a week old is being
reassured by the wrong number. Changed to read `meta.last_sync_at`.

## 4. Scope

**In:**
1. Dexie schema exactly per TRD §4.8, in `lib/offline/db.ts`.
2. `GET /api/journeys/:id/snapshot` — one payload: journey, items, knowledge, guidance,
   prepare tasks, facilities.
3. `syncJourneyOffline(journeyId)` on save and on open.
4. `useOfflineFirst` read-through hook.
5. **Live Journey computed in the browser from Dexie**, so it works in airplane mode.
6. Reconcile: one card naming what changed; never an error dialog.
7. Guest drafts in Dexie — **carried from B-019** (PLAN-02 §5a).
8. Banner reads the snapshot's own timestamp.

**Out:** map tiles (PRD-OFFL-006, P2, needs MAPS-02); queued writes (PRD-OFFL-004, P1, M3
`pending_actions`); offline replanning (PRD-OFFL-005, P1, needs B-026); phrase packs (F12
has no content yet — the store exists and stays empty).

## 5. Risks

1. **A stale NOW card.** The worst failure this feature can produce: a cached page showing
   yesterday's projection reads exactly like a live one. *Mitigation:* Live **always**
   recomputes in the browser from Dexie against the real clock; server props are the first
   paint, never the answer.
2. **Silently serving old knowledge as current.** *Mitigation:* the snapshot's own
   `last_sync_at` is what the banner reports, and the reconcile card names what changed.
3. **A guest's draft outliving its welcome.** Device-local drafts are personal data on a
   shared phone. *Mitigation:* migrate on sign-in, then delete the local copy.
4. **Dexie schema drift.** KNOW-04 deferred a version bump here for the published-view shape
   change. *Mitigation:* version 1 is written fresh against the current views, so there is
   nothing to migrate — recorded so the next shape change bumps deliberately.

## 6. Testing strategy

- **Vitest:** the Dexie layer with `fake-indexeddb`; snapshot round-trip; reconcile diffing.
- **Playwright:** `context.setOffline(true)` — Live renders from Dexie with no network;
  Prepare and saved pages readable; the banner names the snapshot time; reconnect shows one
  card and no error dialog anywhere.
- **The acceptance test (PRD-OFFL-007):** a 3-day journey, airplane mode, readable.

## 7. Acceptance criteria

- [x] Opening or saving a journey writes a snapshot.
- [x] With the network off, Live Journey renders and its NOW card is correct for the real clock.
- [x] Prepare and saved detail pages readable offline (the document is cached NetworkFirst).
- [x] The banner says when the saved information is from, not when the network last answered.
- [x] Reconnect syncs silently; one card when the active journey's knowledge changed.
- [x] **No sync-error dialog exists anywhere** — asserted on the rendered text.
- [x] A guest draft survives a reload and migrates on sign-in, leaving nothing behind.
- [x] A 3-day journey is fully readable in airplane mode (PRD-OFFL-007).

## 8. Self-review findings (step 6)

**1 — The document was the missing half.** IndexedDB held the entire journey and reloading
offline still failed, because the service worker never cached the *navigation* — the browser
never got far enough to read anything. Found by the first offline E2E, which failed with
`net::ERR_FAILED` rather than an assertion. Navigations are now NetworkFirst with a
three-second patience: online a traveler gets the current plan, offline they get the cached
shell and the projection is recomputed over it.

Worth stating plainly: a service worker **cannot** cache the navigation that installed it,
so the very first visit is genuinely network-only. Every visit after that survives.

**2 — The client bundle pulled in `next/headers` again.** Second occurrence of D-086, and
this time it named none of the responsible files: the offline Live view imports
`toEngineJourney`, which lives beside `getKnowledgeBundle`, which reaches the Supabase
server client. Split into `lib/journey-types.ts` (D-112) — a value shared between server and
browser belongs in a module with no request-scoped imports at all.

**3 — A leaked IndexedDB connection presented as a hang.** In the E2E, not the app: each
`indexedDB.open` in a polling loop opened a connection nobody closed, until a later open
blocked behind them. The helper closes every time.

**4 — OPEN-011 was still open and assigned to a shipped item.** `withApi` keys a guest's
rate limit on a device cookie that B-019 was meant to issue and did not, so every guest
shared one bucket. Three lines of middleware, and closed here rather than left pointing at a
finished item.

## 9. Verification note (step 9)

| Criterion | How checked |
|---|---|
| Snapshot written | E2E reads IndexedDB directly after opening Live: journeys, items and knowledge entities all populated. |
| **Airplane mode** | `context.setOffline(true)` then reload. A 3-day journey renders its plan, its items and its LATER list with no network at all (PRD-OFFL-007). |
| **NOW is right for the real clock** | The assertion that matters most. The screen recomputes from IndexedDB on every mount rather than replaying a cached projection — a stale NOW card looks exactly like a live one, and a traveler acts on it (D-110). |
| Banner's "as of" | Reports `meta.last_sync_at`, not the last-reachable time. Someone offline for four minutes may be holding a snapshot from last Tuesday; the old number would have reassured them wrongly. |
| Silent reconcile | No card at all when nothing a plan depends on changed. Comparison is on watched fields only — an edited summary paragraph is not worth interrupting a morning over. |
| **No sync errors** | The rendered text is asserted free of "error", "failed" and "sync" while offline (PRD-OFFL-003, PRD §12.7). |
| Snapshot permissions | The route is `requireAuth` and reads through the traveler's own client — a stranger gets 401. This payload lands in a database on a device somebody might share. |
| Guest drafts | Saved on preview, offered on the journeys list, migrated on tap, and **actually gone** after Discard — asserted across a reload. |
| Storage failures | 16 vitest against a real IndexedDB (`fake-indexeddb`), including: a failed sync leaves the previous snapshot intact, and being offline resolves rather than throwing. |
| Gates | lint 7/7 · typecheck 7/7 · **596 vitest** · 381 pgTAP · **155 Playwright** · build 2/2. |

## 10. Deferred out of this item

- **Map tiles** (PRD-OFFL-006, P2) — needs MAPS-02 and ACCT-03.
- **Queued writes** (PRD-OFFL-004, P1) — the `pending_actions` outbox is M3 per TRD §4.7.
- **Offline replanning** (PRD-OFFL-005, P1) — needs B-026's Change Card.
- **Phrase packs** — the store exists and stays empty; F12 has no content yet.
- **The Downloads section in Prepare** (size, last updated, "Update now") — the snapshot is
  automatic, so nothing is broken without it; it belongs with map tiles, which is what makes
  size worth showing.
