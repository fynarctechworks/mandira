# Mandhira — Development Roadmap

Complete production-grade product; milestones sequence it (TRD §11). Estimates assume solo, AI-assisted, ~6 focused h/day. Content entry/verification time is additional and parallelisable.

| ID | Name | Objective | Included (feature IDs → FEATURE_INVENTORY.md) | Depends on | Deliverables | Completion criteria |
|---|---|---|---|---|---|---|
| **M0** | Project Foundation & Infrastructure (Days 1–4 of TRD §11.2) | Repo, schema, RLS, auth, CI, design tokens — nothing user-visible | PLAT-* (all), KNOW-SCHEMA, AUTH-*, RBAC-* | This docs foundation approved | Monorepo builds; `supabase db reset` clean; RLS tests green; admin seeded; CI pipeline | TRD success criteria 1–3 |
| **M1** | Vertical Slice — Publish, Plan, Live, Offline (Days 5–20) | One destination published by Ops; traveler plans with tiers, sees Health, uses NOW/NEXT/LATER, reads offline | OPS-EDIT-*, OPS-SRC-1, OPS-PUB-*, KNOW-*, DISC-*, TRUST-UI-*, INT-*, PLAN-*, ENG-1..4, PREP-*, LIVE-1..4, OFFL-1..3, MAPS-*, PLAT-PWA | M0 | Deployed prod (web+ops); seeded destination; Flows 1, 2(partial), 3; airplane-mode read | TRD §12 M1 criteria 1–15 |
| **M2** | Adapt & Engage (15 d) | Journey survives change; users are reachable | ADPT-* (user triggers), NOTF-*, REPT-1..4, SHARE-*, LIVE-5 | M1 | Change Cards live; push + local notifications; text reports + Ops queue; pilot with ≥10 planners | Flows 4, 6(text); PRD F6 acceptance matrix passes |
| **M3** | Trusted Knowledge at Scale (25 d) | Ops scales beyond hand-entry; changes reach journeys; smarter search; deeper offline | OPS-INGEST-*, OPS-QUEUE-* (full), OPS-FRESH-*, OPS-IMPACT, DYN-*, SRCH-VEC, OFFL-4..6 | M2 | Ingestion + AI extraction; all queues; weather + 1 transport feed; hybrid search; outbox + offline replanning | Flows 5, 7; 3 destinations published without engineering |
| **M4** | Language, Completion & Accountability (20 d) | Public-launch readiness for a multilingual audience | LANG-* (te/hi), PHRASE-*, CMPL-*, DASH-*, ADVIS-*, REPT-5 (photos), PRIV-EXPORT/DELETE | M3 | te/hi UI+content ≥95%; phrase packs+audio; reflect; Ops dashboards; DPDP flows | Flow 8; PRD locale + dashboard criteria |
| **M5** | Ecosystem Growth (30+ d) | Beyond-launch capabilities | COLLAB-*, CONV-*, CIRC-*, OFFL-TILES, PARTNER-*, NATIVE-SHELL | M4 | Per-capability | Per-capability DoD; PRD §2 decision test each |

Cross-cutting rule (all milestones): no feature ships that violates PRD Principles 1–6, even temporarily; every shipped feature meets PRD §11 Definition of Done and updates `PROJECT_STATUS.md` + `REQUIREMENTS_REGISTRY.md`.
