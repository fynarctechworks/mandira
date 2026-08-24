# Mandhira — Dependency Map

Development order is driven by real technical/business dependencies, not PRD ordering.

```text
M0  Repo & tooling foundation (monorepo, CI, design tokens)
        ↓
M0  Database schema + RLS + generated types        ←— everything reads this
        ↓
M0  Auth (magic link, Google) + profiles + user_roles (RBAC)
        ↓
M1a Ops entity editors + Sources + Trust records + validate/publish gate
        ↓  (knowledge must exist and be publishable before any traveler feature is testable)
M1b Seed destination published through the gate
        ↓
M1c Traveler Discovery + Trust badges  ──────────┐
M1c Journey Engine part 1 (availability, schedule, return guard)
        ↓                                        │
M1d Intent capture (AI, ID-grounded)  ← needs published experiences as candidate list
        ↓                                        │
M1d Journey Builder + tiers + travel estimates ← needs engine + routing provider
        ↓                                        │
M1e Health engine + Prepare  ← needs builder + knowledge prep fields
        ↓                                        │
M1f Live Journey NOW/NEXT/LATER ← needs scheduled items
        ↓                                        │
M1f Core offline (Dexie snapshot) ← needs stable KnowledgeBundle shape ←┘
        ↓
M2  Adaptive replanning (evaluateChange/Change Card) ← needs Health + Live triggers
M2  Notifications (push + local) ← needs journeys with times; leave-by needs Live mode
M2  User reports (text) + Ops Reports queue ← needs trust records + entity IDs
        ↓
M3  Ingestion + AI extraction + full Ops queues ← needs sources, trust, review_tasks, versioning
M3  Knowledge-change → journey impact triggers ← needs replanning (M2) + publish pipeline
M3  Live feeds (weather/transport) ← needs feed configs + trigger path
M3  pgvector hybrid search ← needs enough published content to be useful
M3  Offline outbox + offline replanning ← needs replanning engine (M2) + Dexie (M1)
        ↓
M4  te/hi content + translation workspace ← needs ui_strings + entity editors + AI drafts
M4  Phrase packs + audio ← needs media pipeline + locales
M4  Complete & Reflect ← needs item status history (M2)
M4  Dashboards/advisories/DPDP export ← needs analytics events + queues emitting data
        ↓
M5  Collaborative journeys · conversational assistant (tool-grounded) · circuits UX · offline tiles (PMTiles) · partner hand-offs · optional Expo shell
```

## Per-module dependency notes
| Module | Depends on | Depended on by | Why this position |
|---|---|---|---|
| Schema/RLS | — | everything | Single source of truth; RLS wrong = privacy breach later is unfixable cheaply |
| Auth & RBAC | schema | Ops, journeys, reports | Ops gate and owner-scoped RLS both need identity first |
| Ops editors + trust + publish gate | auth, schema | all traveler features | Traveler app is untestable without published, trust-annotated knowledge; building UI against fake data hides trust-model bugs |
| Journey Engine | knowledge shapes (types only) | builder, health, live, replanning, notifications | Pure package — build early, test exhaustively; everything downstream trusts it |
| Intent (AI) | published experiences, providers/ai | builder | Grounding requires real published IDs |
| Builder | engine, intent, routing | health, prepare, live | Items are the substrate for everything in-journey |
| Live Journey | builder, engine | replanning triggers, leave-by notifications | Done/Late/Stay are the trigger source |
| Offline core | stable KnowledgeBundle | offline replanning (M3) | Freeze the snapshot shape before replicating it |
| Replanning | health, live triggers | knowledge-change impact, offline replanning | Option ladder must exist before external triggers feed it |
| Reports | trust records | freshness auto-downgrade, Ops queue | Signal path into the trust system |
| Ingestion/queues | sources, trust, versions, review_tasks | scale beyond hand-entered destinations | Ops can run without it (manual) in M1–M2; required for 3+ destinations |
| i18n content (te/hi) | editors, ui_strings, AI translate | public launch | Deferring avoids translating churning copy |
| Dashboards | analytics_events, queues | — | Measures everything else; last |
