# Mandhira — Project Overview

Bridge document between `PRD.md` (product truth) and `TRD.md` (technical truth). If anything here conflicts with those, the PRD/TRD win and the conflict must be reported (see CLAUDE.md → Source of Truth).

## 1. What the product is
Mandhira is an intelligent pilgrimage travel platform for Indian pilgrimage journeys. It turns a traveler's intentions and priorities into a realistic, trusted, adaptive journey and keeps that journey working when reality changes. It is one ecosystem with two applications and three shared layers:

- **Traveler PWA** (`apps/web`) — discover, understand, plan, prepare, live the journey (NOW/NEXT/LATER), adapt, complete.
- **Ops Platform** (`apps/ops`) — the operational heart: sources, ingestion, review, verification, conflict resolution, approval, publishing, freshness monitoring, reports, media, translations, audit.
- **Knowledge Layer** — structured, source-attributed, verification-gated pilgrimage knowledge in Postgres (destinations → places → experiences → availability → routes → transport → facilities → guidance → phrases → advisories), readable by travelers only through `v_published_*` views.
- **Journey Engine** (`packages/journey-engine`) — pure TypeScript: scheduling, Journey Health, adaptive replanning option ladder, return guard, NOW/NEXT/LATER projection. Identical code online and offline.
- **Intelligence Layer** (`packages/providers/ai`) — provider-abstracted AI for intent extraction, explanation rewording, search understanding, ops extraction/translation. Grounded on published Knowledge IDs; enforced in code, not prompts.

## 2. Why it exists
Pilgrimage planning is fragmented across dozens of sources; travelers carry the full mental burden of deciding what matters, what to trust, what is feasible, and what to do when plans break. Mandhira reduces that burden without taking control away. Full problem statement: PRD §1–§3.

## 3. Primary users and roles
- **Traveler / Journey Planner** (primary persona): the adult responsible for making a journey work for themselves and often a small group (PRD §3). Generalized traveler model: mobility, age band, pace, walking tolerance, transport preference — the engine branches on attributes, never on "user types".
- **Ops roles** (`ops_role_enum`): researcher, reviewer, verifier, editor, approver, translator, media, support, admin. Separation of duties: the same person cannot review and approve the same change.

## 4. Core problems solved
1. "I don't know how to organize the journey around what matters most" → priority tiers FIXED / PROTECTED / IMPORTANT / OPTIONAL + Journey Builder.
2. "I can't trust whether information is current" → trust records (source tier, verification, freshness, confidence) with visible badges.
3. "My plan falls apart when something changes" → adaptive replanning with the option ladder and Change Cards; nothing auto-applied.
4. "During the journey I don't know what to focus on" → NOW/NEXT/LATER, offline-capable.

## 5. Major modules
Knowledge & Trust · Ops Workflows (queues) · Discovery & Search · Intent & Planning · Journey Engine · Prepare · Live Journey · Adaptive Replanning · Offline · Multilingual & Phrases · Accounts & Personalization · Reports · Notifications · Live/Dynamic Data · Complete & Reflect · Analytics & Dashboards · Platform (auth, RLS, deployment, observability). Full inventory: `FEATURE_INVENTORY.md`.

## 6. System boundaries (permanent — PRD §8)
No payments/booking inside Mandhira (external hand-off links only). No reviews/ratings/social feeds. No ads. No popularity-only ranking. No AI-published facts without human review. No auto-applied journey changes. No turn-by-turn navigation (device maps hand-off). No prescriptive religious guidance.

## 7. High-level architecture
Next.js 15 monorepo (pnpm + turbo) on Vercel; Supabase (Postgres 15 + PostGIS + pg_cron + pgvector + pg_trgm, Auth, Storage, Realtime, Edge Functions) in `ap-south-1`. Offline-first read path: Dexie (IndexedDB) snapshot + Serwist service worker. Provider abstraction for AI (Gemini first), routing (ORS), weather (Open-Meteo), email (Resend), push (Web Push/VAPID), geocoding (Nominatim). Diagram + rules: TRD §2.

## 8. Major workflows
- Traveler: Flow 1 intent→journey · Flow 2 prepare · Flow 3 live day · Flow 4 delay threatening a PROTECTED item · Flow 8 completion/return (PRD §6).
- Knowledge: SOURCE → COLLECT → EXTRACT → NORMALIZE → VALIDATE → VERIFY → REVIEW → APPROVE → PUBLISH → MONITOR → RE-VERIFY (PRD F17–F18; Flows 5–7).
- Change propagation: published knowledge change → impact analysis → affected journeys get Change Cards.

## 9. Key business rules (non-negotiable)
1. User defines what matters; tiers are user-set, never inferred as spiritual importance.
2. Engine never removes PROTECTED, never moves FIXED; option ladder order is fixed (PRD F6).
3. Return guard: the final FIXED item is always protected; breach = Broken health.
4. Publish gate: critical fields require `verification_status ≥ human_reviewed`; travelers structurally cannot see anything below that.
5. Every recommendation carries a "because"; every meaningful change requires an explicit user tap.
6. AI never invents timings/requirements/availability (`assertGrounded`, ID-constrained schemas); AI text is labelled and never gets a Verified badge.
7. Three independent user reports on one field within 14 days auto-downgrade its badge to "Check locally".
8. Traveler profiles (mobility/age band) are owner-only: never visible to Ops, analytics, or exports.

## 10. Important technical decisions & constraints
PWA-first (no Expo in M1, nothing blocks it later) · Supabase over Firebase (relational knowledge) · `_i18n` jsonb for translatable content · `KnowledgeBundle` = Dexie snapshot = engine input (protect this invariant) · tsvector search first, pgvector at M3 · magic link + Google (no SMS) · ~$0/month until usage justifies paid tiers · reference device: ₹10–15k Android on 4G, LCP ≤3.0 s (M1) · en/te/hi at public launch · forward-only additive migrations. Rationale: `DECISION_LOG.md`.
