# Mandhira — Development Backlog

Ordered execution queue derived from REQUIREMENTS_REGISTRY + FEATURE_INVENTORY + DEPENDENCY_MAP. Work top-down; do not start an item whose dependencies aren't COMPLETE. Status for all items: `NOT_STARTED` (track in PROJECT_STATUS.md). Day references map to TRD §11.2.

| # | Backlog item | Feature IDs | Requirement IDs (key) | Priority | Depends on | Milestone |
|---|---|---|---|---|---|---|
| B-001 | Monorepo, CI, lint/test scaffolds | PLAT-01 | TRD-ARCH-001/006 | P0 | — | M0 (D1) |
| B-002 | Design tokens, fonts, base components | PLAT-02 | PRD-DSGN-001..003 | P0 | B-001 | M0 (D1) |
| B-003 | Migrations part 1: enums, locales, sources, trust, versions, audit, tasks | PLAT-03 | TRD-DB-001/002/004 | P0 | B-001 | M0 (D2) |
| B-004 | Migrations part 2: knowledge, users, journeys, reports/notifications + published views | PLAT-03, KNOW-01/03 | PRD-KNOW-001, TRD-ARCH-004, TRD-DB-005 | P0 | B-003 | M0 (D3) |
| B-005 | Generated types + Zod schemas | PLAT-03 | TRD-DB-001, TRD-API-001 | P0 | B-004 | M0 (D3) |
| B-006 | RLS policies + automated RLS tests | PLAT-04 | TRD-DB-003, PRD-PRIV-002 | P0 | B-004 | M0 (D4) |
| B-007 | Auth (magic link+Google+guest), profiles trigger, RBAC gate, admin seed | AUTH-01..05 | PRD-ACCT-001, PRD-OPS-WF-009 | P0 | B-006 | M0 (D4) |
| B-008 | Ops shell (nav, tables, palette) | OPS core shell | PRD-OPS-CNT-001 | P0 | B-007 | M1 (D5) |
| B-009 | Destination + Places editors (incl. schedule builder, geo pin) | OPS-EDIT-01/02 | PRD-OPS-CNT-001 | P0 | B-008 | M1 (D5) |
| B-010 | Experience/availability, routes/transport, facilities/accessibility, guidance editors | OPS-EDIT-03..06 | PRD-KNOW-001/004 | P0 | B-009 | M1 (D6) |
| B-011 | Trust panel + Sources registry (manual) | OPS-EDIT-09, OPS-SRC-01 | PRD-KNOW-002, PRD-OPS-SRC-001 | P0 | B-010 | M1 (D6) |
| B-012 | Validation, submit/verify/approve/publish, media library | OPS-PUB-01/02, OPS-QUEUE-02/04, OPS-MEDIA-01 | PRD-OPS-WF-002/004/008, PRD-KNOW-003 | P0 | B-011 | M1 (D7) |
| B-013 | Seed destination #1 (content) published through the gate | — | PRD-OPS-WF-010 | P0 | B-012 | M1 (D8, likely 2–3 d real) |
| B-014 | Traveler shell + PWA (Serwist, manifest, install, offline banner) | PLAT-05 | TRD-DEPL-002, PRD-OFFL-002 | P0 | B-002 | M1 (D9) |
| B-015 | Discovery pages + trust badges/sheets + search+filters | DISC-01..05, TRST-01..03, SRCH-01 | PRD-DISC-*, PRD-TRST-* | P0 | B-013, B-014 | M1 (D10) |
| B-016 | Engine part 1: availability, buffers, scheduleDay, return guard (+tests) | ENG-01 | TRD-ENG-001/002, PRD-PLAN-005/006 | P0 | B-005 | M1 (D11) |
| B-017 | Engine part 2: computeHealth, buildInitialJourney, generatePrepareTasks, worker | ENG-02/03/06 | PRD-HLTH-*, TRD-ENG-002 | P0 | B-016 | M1 (D12) |
| B-018 | AI provider pkg + intent extraction + brief review + structured form + rate limits | INT-01..03 | PRD-INT-*, TRD-AI-001/002/004, TRD-SEC-001 | P0 | B-015, B-017 | M1 (D13) |
| B-019 | Journey Builder (timeline, tiers, item editor, guest draft, travelers UI) | PLAN-01..06, PLAN-04 | PRD-PLAN-* | P0 | B-018 | M1 (D14) |
| B-020 | RoutingProvider + travel_estimates + maps + Open-in-Maps | MAPS-01..03 | TRD-ARCH-003, TRD-API-005 | P0 | B-019 | M1 (D15) |
| B-021 | Prepare checklist + printable/shareable summary | PREP-01/04, SHARE-01(read-only) | PRD-PREP-001/004, TRD-SEC-004 | P0 | B-019 | M1 (D16) |
| B-022 | Live Journey NOW/NEXT/LATER + start-day + end-of-day | LIVE-01..04, ENG-04 | PRD-LIVE-* | P0 | B-020 | M1 (D17) |
| B-023 | Core offline: Dexie snapshot, cache-first reads, reconcile | OFFL-01..03 | PRD-OFFL-001..003/007, TRD-ARCH-002/005 | P0 | B-022 | M1 (D18) |
| B-024 | Quality pass: axe, perf budget, Sentry, analytics allowlist, copy review | PLAT-06 | PRD-DSGN-005/006, TRD-PERF-001, PRD-ANLY-001 | P0 | B-023 | M1 (D19) |
| B-025 | Production deploy + backups + runbook + pilot invite | PLAT-07 | TRD-DEPL-001/003 | P0 | B-024 | M1 (D20) |
| B-026 | evaluateChange/applyOption + Change Card + change events + trigger wiring | ENG-05, ADPT-01..03, PLAN-07 | PRD-ADPT-001..006/008 | P0 | M1 | M2 |
| B-027 | Push infra + scheduler/sender + local leave-by + in-app list + status roller | NOTF-01..04 | PRD-NOTF-*, TRD-API-004 | P1 | B-026 | M2 |
| B-028 | Text reports + Ops Reports queue + resolution notifications; booked-slot→FIXED | REPT-01/04, OPS-QUEUE-05, PREP-02/03 | PRD-REPT-001..003, PRD-OPS-WF-005 | P1 | B-027 | M2 |
| B-029 | Ingestion+captures+diffs+change candidates; AI extraction + Review queue | OPS-SRC-02..04, OPS-QUEUE-01 | PRD-OPS-SRC-002..004, PRD-OPS-WF-001 | P1 | M2 | M3 |
| B-030 | Conflicts + full Approve impact + Freshness monitor + auto-downgrade | OPS-SRC-05, OPS-QUEUE-03/06/07, REPT-05 | PRD-OPS-SRC-005, PRD-OPS-WF-003/006/007, PRD-REPT-004 | P1 | B-029 | M3 |
| B-031 | Live feeds (weather+transport) + fallback labels + feed→triggers | DYN-01..05, ADPT-04 | PRD-DYN-* | P1 | B-026 | M3 |
| B-032 | pgvector embeddings + hybrid search | SRCH-03 | TRD-DB-005 | P1 | B-013×3 dest. | M3 |
| B-033 | Offline outbox + offline replanning | OFFL-04/05, REPT-02 | PRD-OFFL-004/005, PRD-ADPT-007 | P1 | B-026 | M3 |
| B-034 | ui_strings pipeline + te/hi UI + content workflow + translation workspace | LANG-02..04, OPS-TRANS-01/02 | PRD-LANG-002/003, PRD-OPS-CNT-004 | P1 | M3 | M4 |
| B-035 | Phrase packs + audio + Show-to-someone | LANG-05/06, LIVE-05 | PRD-LANG-004 | P1 | B-034 | M4 |
| B-036 | Complete & Reflect + plan-similar + personalization ranking | CMPL-01..03, PERS-01/02 | PRD-CMPL-*, PRD-ACCT-004 | P1 | M2 | M4 |
| B-037 | Ops dashboards + advisories + report photos + DPDP export/delete | OPS-DASH-01..03, REPT-03, PRIV-03/04 | PRD-OPS-MON-*, PRD-PRIV-005 | P1 | B-030 | M4 |
| B-038+ | M5 growth items (collab, conversational, circuits, tiles, partners, Expo) | M5 set | P2 registry rows | P2 | M4 | M5 |
