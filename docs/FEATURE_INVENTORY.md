# Mandhira — Feature & Module Inventory

Hierarchical inventory of the complete product. **Status is not tracked in this file** — see `PROJECT_STATUS.md` for where each feature stands. Feature IDs are stable; requirement links point to `REQUIREMENTS_REGISTRY.md`. Priority: P0 launch-blocking for its milestone / P1 complete-product / P2 M5.

```text
PLATFORM (PLAT)
├── PLAT-01 Monorepo & tooling (pnpm, turbo, CI, lint, vitest, playwright)
├── PLAT-02 Design system (tokens, fonts, light/dark, components lib)
├── PLAT-03 Database schema & migrations (+ enums, views, triggers)
├── PLAT-04 RLS & security policies (+ automated RLS tests)
├── PLAT-05 PWA shell (Serwist, manifest, install prompt, update toast)
├── PLAT-06 Observability (Sentry, analytics_events, alerts)
├── PLAT-07 Deployment (Vercel×2, Supabase prod, backups, runbook)
└── PLAT-08 Rate limiting & CSP

IDENTITY & ACCESS (AUTH)
├── AUTH-01 Magic-link auth (Resend SMTP)   ├── AUTH-02 Google OAuth
├── AUTH-03 Guest mode + draft migration    ├── AUTH-04 Profiles (auto-create, prefs)
└── AUTH-05 RBAC (user_roles, has_role, ops gate, separation of duties)

KNOWLEDGE & TRUST (KNOW / OPS)
├── KNOW-01 Entity model (all F1 entities)
├── KNOW-02 Trust records + freshness/confidence computation (pg_cron)
├── KNOW-03 Published views with trust jsonb
├── OPS-EDIT-01 Destination editor          ├── OPS-EDIT-02 Places (+opening schedule builder)
├── OPS-EDIT-03 Experiences (+availability builder) ├── OPS-EDIT-04 Routes & transport
├── OPS-EDIT-05 Facilities & accessibility  ├── OPS-EDIT-06 Guidance blocks
├── OPS-EDIT-07 Phrases (+audio)            ├── OPS-EDIT-08 Advisories
├── OPS-EDIT-09 Trust panel (inline, per critical field)
├── OPS-EDIT-10 Relationships, nearby, circuits, editorial weight
├── OPS-MEDIA-01 Media library (upload, variants, licence, usage)
├── OPS-PUB-01 Validation rules              ├── OPS-PUB-02 Submit/approve/publish + impact count
├── OPS-PUB-03 entity_versions + restore     └── OPS-PUB-04 audit_log
├── OPS-SRC-01 Source registry               ├── OPS-SRC-02 Ingestion jobs + captures + diffs (M3)
├── OPS-SRC-03 AI extraction + excerpt gate (M3) ├── OPS-SRC-04 Change candidates (M3)
├── OPS-SRC-05 Conflict auto-detect (M3)
├── OPS-QUEUE-01 Review (M3) ├── OPS-QUEUE-02 Verify ├── OPS-QUEUE-03 Conflicts (M3)
├── OPS-QUEUE-04 Approve     ├── OPS-QUEUE-05 Reports (M2) ├── OPS-QUEUE-06 Freshness monitor (M3)
├── OPS-QUEUE-07 Impact-before-publish (M3)
├── OPS-TRANS-01 Translation workspace + AI drafts (M4) ├── OPS-TRANS-02 Locale management (M4)
└── OPS-DASH-01 Knowledge health ├── OPS-DASH-02 Product signals ├── OPS-DASH-03 Users/flags/admin (M4)

TRAVELER — DISCOVER & UNDERSTAND (DISC/TRST/SRCH)
├── DISC-01 Home            ├── DISC-02 Destination page  ├── DISC-03 Place page
├── DISC-04 Experience page ├── DISC-05 Add-to-journey sheet (tier picker)
├── SRCH-01 Text search + 6 filters (tsvector)  ├── SRCH-02 Journey-fit ranking
├── SRCH-03 Hybrid pgvector search (M3)
├── TRST-01 Trust badge     ├── TRST-02 Trust sheet       ├── TRST-03 Sources footer
└── TRST-04 Stale in-journey notes

TRAVELER — PLAN (INT/PLAN/ENG/HLTH/PREP)
├── INT-01 NL intent input  ├── INT-02 Brief review (+Suggested, unclear) ├── INT-03 Structured form ×5
├── PLAN-01 Journey/day/item model + timeline UI (dnd)  ├── PLAN-02 Tier system + rules
├── PLAN-03 Item editor sheet (window, dependency, note) ├── PLAN-04 Traveler group management
├── PLAN-05 Buffers (visible, multipliers)  ├── PLAN-06 Return guard  ├── PLAN-07 Simplify-day (M2)
├── ENG-01 resolveAvailability/computeBuffer/scheduleDay/checkReturnGuard
├── ENG-02 computeHealth (5 checks, 4 states, causes)
├── ENG-03 buildInitialJourney + generatePrepareTasks
├── ENG-04 getNowNextLater  ├── ENG-05 evaluateChange/applyOption (M2)  ├── ENG-06 Worker offload
├── HLTH-01 Health pill + detail sheet
├── PREP-01 Checklist (groups, Why?, trust)  ├── PREP-02 Deadlines→notifications (M2)
├── PREP-03 Booked-slot→FIXED promotion (M2) └── PREP-04 Summary (share/print)
├── MAPS-01 RoutingProvider + travel_estimates cache + PostGIS fallback
├── MAPS-02 Place/destination maps (MapLibre)  └── MAPS-03 Open-in-Maps hand-off

TRAVELER — LIVE & ADAPT (LIVE/ADPT/OFFL)
├── LIVE-01 Day activation  ├── LIVE-02 NOW card (Done/Late/Stay) ├── LIVE-03 NEXT + leave-by
├── LIVE-04 LATER + end-of-day ├── LIVE-05 Phrase shortcut (M4 full)
├── ADPT-01 Trigger capture (M2) ├── ADPT-02 Change Card UI (M2) ├── ADPT-03 Decision apply (M2)
├── ADPT-04 Knowledge/live-triggered cards (M3)
├── OFFL-01 Dexie snapshot sync ├── OFFL-02 Offline read (journey/knowledge/prepare/trust)
├── OFFL-03 Offline banner + reconcile card ├── OFFL-04 pending_actions outbox (M3)
├── OFFL-05 Offline replanning (M3)         └── OFFL-06 Offline map tiles (M5)

ENGAGEMENT & LIFECYCLE (NOTF/REPT/SHARE/CMPL/PERS)
├── NOTF-01 Web Push infra (VAPID, subscriptions) (M2) ├── NOTF-02 Scheduler+sender jobs (M2)
├── NOTF-03 Local leave-by (M2) ├── NOTF-04 In-app notification list (M2)
├── REPT-01 Report form (text) (M2) ├── REPT-02 Offline queue (M3) ├── REPT-03 Photos (M4)
├── REPT-04 Resolution notifications (M2) ├── REPT-05 Auto-downgrade rule (M3)
├── SHARE-01 Share token + public summary (M2)
├── CMPL-01 Journey Record (M4) ├── CMPL-02 Reflection (M4) ├── CMPL-03 Plan-similar (M4)
└── PERS-01 Explicit signals capture ├── PERS-02 "Because you…" ranking (M4)

LANGUAGE (LANG) — M4 unless noted
├── LANG-01 next-intl plumbing + en (M1) ├── LANG-02 ui_strings pipeline ├── LANG-03 te/hi UI
├── LANG-04 te/hi content workflow ├── LANG-05 Phrase packs + audio + Show-to-someone
└── LANG-06 Transliteration utilities

DYNAMIC DATA (DYN) — M3
├── DYN-01 Feed configs ├── DYN-02 Open-Meteo weather ├── DYN-03 Transport feed (per launch dest.)
├── DYN-04 Outage fallback labels └── DYN-05 Feed→ADPT triggers

PRIVACY & COMPLIANCE (PRIV)
├── PRIV-01 Sensitive-attribute isolation (M1) ├── PRIV-02 Location discipline (M1)
├── PRIV-03 DPDP export (M4) ├── PRIV-04 Account deletion 30 d (M4) └── PRIV-05 Consent notice (M1)

M5 GROWTH
├── COLLAB-01 Multi-editor journeys ├── CONV-01 Tool-grounded conversational assistant
├── CIRC-01 Circuits UX ├── PARTNER-01 External hand-off integrations └── NATIVE-01 Expo shell
```

## Cross-cutting sub-features (apply to every feature; checked in review, not tracked separately)
Loading/empty/error/success states · form validation (Zod) · authorization check server-side · responsive mobile-first · accessibility (WCAG 2.2 AA, icon+text status) · i18n-externalised strings · audit logging for Ops mutations · pagination/virtualisation for lists >50 · offline behavior defined (works/queued/disabled+message) · analytics event (allowlisted) · voice/copy per PRD §12.7.

## Feature table (ID → module, requirements, priority, milestone)
| Feature ID | Module | Related requirements | Priority | Milestone |
|---|---|---|---|---|
| PLAT-01..08 | Platform | TRD-ARCH-001/005/006, TRD-DB-001/002/006, TRD-SEC-001..003, TRD-PERF-*, TRD-DEPL-*, TRD-OBSV-001, PRD-DSGN-001..006 | P0 | M0–M1 |
| AUTH-01..05 | Identity | PRD-ACCT-001/002, TRD-DB-003, PRD-OPS-WF-009 | P0 | M0 |
| KNOW-01..03 | Knowledge | PRD-KNOW-001..006, TRD-ARCH-004, TRD-DB-004/005 | P0 | M0–M1 |
| OPS-EDIT-01..10, OPS-MEDIA-01, OPS-PUB-01..04, OPS-SRC-01, OPS-QUEUE-02/04 | Ops core | PRD-OPS-CNT-001..003, PRD-OPS-WF-002/004/008/009, PRD-OPS-SRC-001 | P0 | M1 |
| DISC-01..05, SRCH-01..02, TRST-01..04 | Discover | PRD-DISC-001..008, PRD-TRST-001..006 | P0 | M1 |
| INT-01..03 | Intent | PRD-INT-001..006, TRD-AI-001/002/004 | P0 | M1 |
| PLAN-01..06, ENG-01..04/06, HLTH-01, PREP-01/04, MAPS-01..03 | Plan | PRD-PLAN-001..006/008..010, PRD-HLTH-001..005, PRD-PREP-001/004, TRD-ENG-001/002 | P0 | M1 |
| LIVE-01..04, OFFL-01..03 | Live+Offline core | PRD-LIVE-001..006, PRD-OFFL-001..003/007, TRD-ARCH-005 | P0 | M1 |
| ADPT-01..03, ENG-05, PLAN-07, PREP-02/03, NOTF-01..04, REPT-01/04, SHARE-01 | Adapt & engage | PRD-ADPT-001..006/008, PRD-NOTF-001..003, PRD-REPT-001..003, PRD-PREP-002/003 | P0/P1 | M2 |
| OPS-SRC-02..05, OPS-QUEUE-01/03/05..07, DYN-01..05, SRCH-03, OFFL-04/05, ADPT-04, REPT-02/05 | Scale & trust | PRD-OPS-SRC-002..005, PRD-OPS-WF-001/003/005..007/010, PRD-DYN-001..005, PRD-ADPT-007, PRD-OFFL-004/005, PRD-REPT-004 | P1 | M3 |
| LANG-02..06, OPS-TRANS-01/02, CMPL-01..03, PERS-01/02, OPS-DASH-01..03, PRIV-03/04, REPT-03 | Launch polish | PRD-LANG-002..004, PRD-OPS-CNT-004, PRD-CMPL-001..004, PRD-ACCT-004, PRD-OPS-MON-001..003, PRD-PRIV-005, PRD-ANLY-001 | P1 | M4 |
| COLLAB/CONV/CIRC/PARTNER/NATIVE/OFFL-06 | Growth | PRD scope §8 deferred list, PRD-OFFL-006 | P2 | M5 |
