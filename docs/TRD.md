# MANDHIRA — TECHNICAL REQUIREMENTS DOCUMENT

**Version:** 1.0 · **Companion to:** MANDHIRA_PRD.md v1.0 · **Owner:** Phani / Stimuli IQ Private Limited · **Date:** August 2026

---

## 📊 1. DOCUMENT OVERVIEW

### 1.1 Purpose
This TRD specifies how the complete Mandhira ecosystem is built: traveler PWA, Ops platform, Knowledge Layer, Journey Engine, Intelligence Layer, and supporting services. It is written for AI-assisted solo development (Claude, Cursor, v0, Bolt): every table, field, function, and library is named exactly so generated code is consistent across sessions.

### 1.2 Two things this document separates
- **Full production architecture (Sections 2–10):** the system Mandhira grows into. Nothing here is "prototype-only".
- **Incremental implementation order (Sections 11–12):** Milestone 1 is a real vertical slice — Ops can publish verified knowledge; a traveler can discover it, build a prioritised journey, see feasibility, and use NOW/NEXT/LATER with core offline access. Later milestones add capabilities without rebuilding the foundation.

### 1.3 Confirmed decisions (from founder)
| Area | Decision |
|---|---|
| Platform | Next.js PWA (traveler) + Next.js Ops app, one monorepo; no Expo in Milestone 1, but nothing blocks a later React Native client |
| Backend | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions, pg_cron, pgvector) |
| Hosting | Vercel (free Hobby tier initially), custom domain when ready |
| Auth | Email magic link primary, Google OAuth secondary, phone OTP later |
| Maps | OSM ecosystem via a provider abstraction (MapLibre + OpenRouteService); offline tiles deferred |
| AI | Provider-abstracted via Vercel AI SDK; cheapest reliable structured-output model first; strict grounding on Knowledge IDs |
| Search | Postgres full-text first; pgvector ready, activated in Milestone 3 |
| Offline | Milestone 1: read-only journey + NOW/NEXT/LATER + referenced knowledge. Milestone 3+: queued reports, offline replanning, tiles |
| Budget | ~$0/month until usage justifies paid tiers; every paid dependency documented with free alternative |
| Team | Solo, AI-assisted; Ops roles designed for additional contributors later |
| Device floor | ₹10–15k Android, 4G, intermittent connectivity |

### 1.4 Naming conventions (AI tools must follow verbatim)
- Database: `snake_case` tables and columns; primary keys `id uuid default gen_random_uuid()`; timestamps `created_at`, `updated_at` (timestamptz, UTC); soft-delete via `deleted_at` where noted.
- Translatable text: `jsonb` columns suffixed `_i18n`, shape `{ "en": "...", "te": "...", "hi": "..." }`. Fallback to `en` is done in one shared helper `getI18n(value, locale)`.
- Enums: Postgres `enum` types named `<table>_<column>_enum` when shared, otherwise `text` with a `check` constraint — both listed below.
- TypeScript: types generated from the database (`supabase gen types`) into `packages/db/types.ts`; never hand-write table types.
- Routes: traveler app under `apps/web`, Ops under `apps/ops`, shared packages under `packages/*`.

---

## 🏗️ 2. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                                 │
│  apps/web  — Traveler PWA (Next.js 15, App Router, installable)          │
│             ├─ Service worker (Serwist) → app shell + API cache          │
│             ├─ IndexedDB (Dexie) → offline journey + knowledge snapshot  │
│             └─ Journey Engine (packages/journey-engine, runs in browser) │
│  apps/ops  — Ops Platform (Next.js 15, desktop web)                      │
└───────────────┬──────────────────────────────────────────┬───────────────┘
                │ HTTPS (Supabase JS client + Next.js route handlers)      │
┌───────────────▼──────────────────────────────────────────▼───────────────┐
│  BACKEND (Vercel + Supabase)                                             │
│  Next.js Route Handlers / Server Actions  ── business logic, AI calls    │
│  Supabase Edge Functions ────────────────── cron workers, ingestion,     │
│                                             freshness, notifications     │
│  Supabase Auth ─────────────────────────── magic link, Google, JWT       │
│  Row Level Security ────────────────────── per-user + per-role access    │
└───────────────┬──────────────────────────────────────────┬───────────────┘
                │                                          │
┌───────────────▼─────────────────┐      ┌─────────────────▼───────────────┐
│  DATABASE (Supabase Postgres)   │      │  EXTERNAL PROVIDERS (abstracted)│
│  Knowledge schema (public)      │      │  AI: Gemini / Anthropic / OpenAI│
│  Trust & ops schema             │      │  Maps: MapLibre tiles (MapTiler │
│  User & journey schema          │      │        free) + ORS routing      │
│  pg_cron · pgvector · PostGIS   │      │  Email: Resend (magic-link SMTP)│
│  Supabase Storage (media)       │      │  Push: Web Push (VAPID)         │
└─────────────────────────────────┘      │  Live: Open-Meteo (weather),    │
                                         │        transport feeds per dest │
                                         │  Observability: Sentry, Vercel  │
                                         └─────────────────────────────────┘
```

### 2.1 Key architectural rules
1. **Journey Engine is a pure TypeScript package** with no I/O. Same code runs in the browser (offline, instant Health recompute) and on the server (notifications, impact analysis). Input: a `JourneySnapshot` (journey + items + referenced knowledge). Output: `HealthReport` or `ChangeCard`. Deterministic; fully unit-tested.
2. **Provider abstraction layer** in `packages/providers` with one interface per capability: `AiProvider`, `RoutingProvider`, `GeocodingProvider`, `WeatherProvider`, `EmailProvider`, `PushProvider`. Concrete adapters are swappable via environment variables. App code never imports a vendor SDK directly.
3. **Knowledge is read from published views only.** Traveler app queries `v_published_*` views; Ops reads base tables. A fact with `verification_status` below `human_reviewed` is structurally invisible to travelers.
4. **Every critical fact carries a `trust_records` row.** Critical fields = opening schedules, availability rules, closure rules, requirements, transport durations.
5. **RLS on every table.** Travelers see only their own journey data + published knowledge. Ops access is by role in `user_roles`.
6. **Offline-first read path:** the traveler app reads from Dexie first, then revalidates from the network (stale-while-revalidate). Writes go to the network when online; in Milestone 3 a `pending_actions` outbox is added.
7. **Monorepo** (pnpm workspaces + Turborepo): `apps/web`, `apps/ops`, `packages/ui`, `packages/db`, `packages/journey-engine`, `packages/providers`, `packages/i18n`, `packages/config`.

---

## 🛠️ 3. TECHNOLOGY STACK

| Component | Technology (exact) | Why this choice |
|---|---|---|
| Monorepo | `pnpm` workspaces + `turbo` | Shared packages between traveler app and Ops without publishing; AI tools handle this layout well |
| Framework | `next@15` (App Router, React 19, TypeScript strict) | Founder's stack; server components reduce client JS for budget phones; one ecosystem for both apps |
| Styling | `tailwindcss@4` + design tokens as CSS variables (from PRD §12) | Fast, AI-friendly, theming via tokens for light/dark |
| UI components | `shadcn/ui` (Radix primitives) + `lucide-react` icons + `vaul` (bottom sheets) + `cmdk` (Ops command palette) | Pre-built, accessible, copy-in components; bottom sheets are central to the PRD (Change Card, item editor) |
| Forms & validation | `react-hook-form` + `zod` + `@hookform/resolvers` | Zod schemas double as API validation and AI structured-output schemas |
| Data fetching & cache | `@tanstack/react-query@5` with `persistQueryClient` + `@tanstack/query-sync-storage-persister` | Stale-while-revalidate, offline persistence of query cache |
| Local DB (offline) | `dexie@4` + `dexie-react-hooks` | IndexedDB with a clean schema; stores journey snapshot + referenced knowledge |
| Client state | `zustand@5` | Small, simple; only for UI/live-journey session state |
| PWA / service worker | `@serwist/next` | Maintained successor to next-pwa; precaches app shell, runtime-caches API and images |
| Database | Supabase Postgres 15 with extensions `postgis`, `pg_cron`, `pgvector`, `pg_trgm`, `unaccent` | Relational knowledge model; geo queries; scheduled jobs; semantic search ready |
| Auth | Supabase Auth (magic link via custom SMTP, Google OAuth) + `@supabase/ssr` | Free, integrates with RLS; no SMS cost |
| Storage | Supabase Storage buckets `media` (public), `reports` (private), `captures` (private) | 1 GB free; signed URLs for private buckets |
| Server logic | Next.js Route Handlers (`app/api/**/route.ts`) and Server Actions; Supabase Edge Functions (Deno) for cron/ingestion | Route handlers for request/response; Edge Functions for scheduled background work on the free tier |
| Scheduling | `pg_cron` (DB-side: freshness, validity expiry) + Vercel Cron (Hobby: 2 jobs, daily) + Supabase Edge Function scheduler | Free; no external queue needed at this scale |
| Realtime | Supabase Realtime (Postgres changes) on `journeys`, `notifications` | Multi-device sync and in-app notification delivery |
| AI SDK | `ai` (Vercel AI SDK) + `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/openai` | One API (`generateObject`, `streamText`) across providers; structured outputs with Zod |
| AI model (initial) | Google `gemini-2.5-flash` (free tier) for F3/F17; `gemini-2.5-flash-lite` for classification; swap to `claude-sonnet-4-6` / `gpt-4.1-mini` via env for quality-sensitive tasks | Cheapest reliable structured output with strong Indic-language support; abstraction keeps the switch one variable |
| Embeddings (M3) | `text-embedding-004` via `@ai-sdk/google` → `vector(768)` in pgvector | Free tier; stays inside Supabase |
| Maps rendering | `maplibre-gl@4` + `react-map-gl` (MapLibre mode); tiles from MapTiler free tier (100k loads/mo) or Protomaps PMTiles self-hosted | Open, no Google lock-in; PMTiles path enables offline tiles later |
| Routing / travel time | OpenRouteService API (free 2,000 req/day) behind `RoutingProvider`; fallback: PostGIS straight-line × mode factor | Acceptable for travel-leg estimates; provider swap to Google Routes possible later |
| Geocoding (Ops only) | Nominatim (OSM) behind `GeocodingProvider`; Ops confirms pins on map | Free; used only by operators, low volume |
| Weather (live) | Open-Meteo API (free, no key) behind `WeatherProvider` | Free, reliable, no key |
| Email | Resend (free 3,000/mo) as Supabase custom SMTP + transactional email | Supabase built-in SMTP is limited to ~2 emails/hour — unusable for magic links |
| Push | `web-push` (VAPID) + `notification_subscriptions` table | Free; PWA push on Android Chrome; iOS 16.4+ when installed |
| i18n | `next-intl` (UI strings) + `_i18n` jsonb for content + `@indic-transliteration/sanscript` for transliteration | Route-based locales, server-rendered; adding a locale = adding a JSON file + DB rows |
| Images | `next/image` with Supabase Storage transformations (`?width=`) + `sharp` in Ops upload | Small payloads on 4G |
| Search (M1) | Postgres `tsvector` generated columns + `pg_trgm` | Zero extra infra |
| Charts (Ops) | `recharts` | Standard, AI-known |
| Tables (Ops) | `@tanstack/react-table` + shadcn Table | Sticky headers, bulk select, filtering |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Journey timeline reordering |
| Dates | `date-fns` + `date-fns-tz` (IANA `Asia/Kolkata` default; journeys store `timezone`) | Lightweight |
| Testing | `vitest` (engine + utils), `@playwright/test` (flows), `@axe-core/playwright` (a11y) | Engine correctness is product-critical |
| Lint/format | `eslint` (next config) + `prettier` | Standard |
| Observability | `@sentry/nextjs` (free 5k errors/mo) + Vercel Analytics + Supabase logs | Enough at this scale |
| Analytics (product) | Own table `analytics_events` (no PII) + Ops dashboard | Privacy-safe, free |
| CI/CD | GitHub Actions (lint, typecheck, vitest, migrations check) → Vercel preview/prod | Free for public/private small repos |
| Migrations | Supabase CLI (`supabase migration new`, `supabase db push`) with SQL files in `supabase/migrations` | Versioned schema, reproducible locally |

**Paid-dependency register (none required in Milestone 1):**
| Service | When needed | Expected cost | Free alternative | Migration path |
|---|---|---|---|---|
| Vercel Pro | >100 GB bandwidth/mo or team seats or >2 cron jobs | $20/mo | Stay on Hobby; move cron to Supabase Edge scheduler | None needed |
| Supabase Pro | DB >500 MB, storage >1 GB, need PITR/no pausing after 7 idle days | $25/mo | Keep DB lean; weekly keep-alive ping | None needed |
| AI provider paid tier | >Gemini free RPD, or Claude/GPT quality needed | $5–50/mo | Gemini free; cache AI outputs | Env var switch |
| MapTiler paid | >100k map loads/mo | $25/mo | Self-host PMTiles on Supabase Storage/Cloudflare R2 | Change tile URL |
| ORS paid / Google Routes | >2,000 routing req/day | $0–50/mo | Cache routes per (from,to,mode) in `travel_estimates` | Provider adapter |
| Domain | Production launch | ~₹1,000/yr | Vercel subdomain (dev only) | DNS change |

---

## 🗄️ 4. DATABASE SCHEMA

All tables in schema `public`. Types: `uuid`, `text`, `int`, `numeric`, `boolean`, `timestamptz`, `date`, `time`, `jsonb`, `geography(Point,4326)`, `vector(768)`, `tsvector`. Every table has `id uuid pk`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger-maintained) unless stated. Columns marked **(i18n)** are `jsonb` locale maps. Columns marked **(critical)** require a `trust_records` row.

### 4.1 Shared enums
| Enum name | Values |
|---|---|
| `publish_status_enum` | `draft`, `in_review`, `published`, `archived` |
| `verification_status_enum` | `unverified`, `ai_extracted`, `human_reviewed`, `verified`, `disputed` |
| `source_tier_enum` | `T1`, `T2`, `T3`, `T4`, `T5` |
| `freshness_enum` | `fresh`, `aging`, `stale` |
| `confidence_enum` | `high`, `medium`, `low` |
| `place_type_enum` | `temple`, `shrine`, `sacred_site`, `ghat`, `viewpoint`, `facility`, `transport_point`, `accommodation`, `food` |
| `facility_subtype_enum` | `restroom`, `drinking_water`, `cloakroom`, `medical`, `parking`, `atm`, `rest_area`, `help_desk` |
| `experience_type_enum` | `darshan`, `ritual`, `aarti`, `seva`, `festival`, `event`, `walk`, `cultural`, `other` |
| `availability_kind_enum` | `always_during_opening`, `daily_fixed_times`, `weekly_pattern`, `date_range`, `calendar_dates`, `on_request` |
| `travel_mode_enum` | `walk`, `vehicle`, `public_transport`, `hired`, `other` |
| `difficulty_enum` | `easy`, `moderate`, `hard` |
| `guidance_type_enum` | `before_you_go`, `what_to_carry`, `etiquette`, `timing_tip`, `safety`, `family`, `accessibility` |
| `priority_tier_enum` | `fixed`, `protected`, `important`, `optional` |
| `journey_item_type_enum` | `experience`, `travel_leg`, `rest`, `meal`, `fixed_commitment`, `free_time` |
| `journey_status_enum` | `draft`, `upcoming`, `active`, `completed`, `archived` |
| `health_state_enum` | `comfortable`, `tight`, `at_risk`, `broken` |
| `mobility_enum` | `full`, `limited_walking`, `wheelchair`, `needs_rest_frequently` |
| `age_band_enum` | `child`, `adult`, `senior` |
| `pace_enum` | `relaxed`, `balanced`, `full` |
| `report_type_enum` | `timing_changed`, `closed`, `accessibility_issue`, `wrong_information`, `outdated_guidance`, `other` |
| `report_status_enum` | `new`, `triaged`, `verifying`, `resolved_updated`, `resolved_confirmed_correct`, `resolved_unverifiable`, `closed` |
| `ops_role_enum` | `researcher`, `reviewer`, `verifier`, `editor`, `approver`, `translator`, `media`, `support`, `admin` |
| `review_task_type_enum` | `review`, `verify`, `conflict`, `approve`, `report`, `reverify` |
| `task_status_enum` | `open`, `in_progress`, `done`, `rejected` |
| `change_trigger_enum` | `user_late`, `user_done_delta`, `user_stay_longer`, `knowledge_update`, `live_transport`, `live_weather`, `item_added`, `item_removed`, `preferences_changed`, `availability_changed` |
| `notification_type_enum` | `prepare_deadline`, `journey_tomorrow`, `leave_by`, `journey_change`, `report_resolved`, `advisory`, `suggestion` |

### 4.2 Locales & translation infrastructure
**`locales`** — `code text pk` (e.g. `en`,`te`,`hi`), `name_native text`, `name_en text`, `script text`, `transliteration_scheme text`, `is_active boolean`, `sort_order int`.

**`ui_strings`** — `key text`, `locale text fk locales`, `value text`, `status text check in ('draft','ai_draft','confirmed')`; pk (`key`,`locale`). (next-intl JSON is generated from this table at build; Ops edits here.)

### 4.3 Sources & trust
**`sources`** — `name text`, `source_type text check in ('official_authority','official_destination_org','government','licensed_provider','partner','structured_service','curated_research','user_report')`, `tier source_tier_enum`, `url text`, `contact text`, `coverage jsonb` (destination ids), `refresh_cadence_days int`, `ingestion_method text check in ('manual','url_monitor','api','file_upload')`, `owner_user_id uuid fk auth.users`, `status text check in ('active','paused','retired')`, `notes text`.

**`trust_records`** — `entity_table text`, `entity_id uuid`, `field_name text` (null = whole entity), `source_id uuid fk sources`, `source_tier source_tier_enum`, `verification_status verification_status_enum default 'unverified'`, `verified_at timestamptz`, `verified_by uuid fk auth.users`, `valid_until date`, `evidence_url text`, `evidence_excerpt text`, `freshness freshness_enum` (generated by pg_cron daily: ≤90d fresh, ≤180d aging, else/expired stale), `confidence confidence_enum` (generated: T1/T2+verified+fresh→high; verified+aging or T3+verified+fresh→medium; else low), `conflict_flag boolean default false`, `report_downgrade boolean default false`, `ai_generated boolean default false`. Unique (`entity_table`,`entity_id`,`field_name`).

**`source_captures`** — `source_id fk sources`, `captured_at timestamptz`, `storage_path text` (bucket `captures`), `content_hash text`, `diff_from_previous text`, `ingestion_job_id uuid fk ingestion_jobs`.

**`ingestion_jobs`** — `source_id fk sources`, `kind text check in ('scheduled','manual')`, `status text check in ('queued','running','succeeded','failed')`, `started_at`, `finished_at`, `error text`, `triggered_by uuid`.

**`ai_extractions`** — `capture_id fk source_captures`, `model text`, `provider text`, `proposed_entities jsonb` (array of `{entity_table, entity_id|null, fields:{name:{value, confidence, excerpt}}}`), `status text check in ('pending','reviewed')`, `reviewed_by uuid`, `reviewed_at`.

**`change_candidates`** — `entity_table text`, `entity_id uuid`, `field_name text`, `old_value jsonb`, `new_value jsonb`, `source_id fk sources`, `capture_id fk source_captures`, `excerpt text`, `status task_status_enum`, `decided_by uuid`, `decided_at`, `decision_reason text`.

**`conflicts`** — `entity_table text`, `entity_id uuid`, `field_name text`, `values jsonb` (array of `{source_id, tier, value, captured_at}`), `status text check in ('open','resolved_winner','resolved_both_valid','escalated')`, `winner_source_id uuid`, `resolution_reason text`, `resolved_by uuid`, `resolved_at`.

**`entity_versions`** — `entity_table text`, `entity_id uuid`, `version int`, `snapshot jsonb`, `changed_fields text[]`, `changed_by uuid`, `change_reason text`, `created_at`. (Insert trigger on every knowledge table.)

**`audit_log`** — `actor_user_id uuid`, `action text`, `entity_table text`, `entity_id uuid`, `before jsonb`, `after jsonb`, `ip_hash text`, `created_at`.

**`review_tasks`** — `task_type review_task_type_enum`, `entity_table text`, `entity_id uuid`, `field_name text`, `related_id uuid` (change_candidate / conflict / report / extraction id), `status task_status_enum default 'open'`, `assigned_to uuid`, `priority int default 3`, `due_at timestamptz`, `notes text`, `completed_by uuid`, `completed_at`.

### 4.4 Knowledge layer
**`destinations`** — `slug text unique`, `name_i18n jsonb`, `region text`, `state text`, `country text default 'IN'`, `centre geography(Point,4326)`, `radius_km numeric default 5`, `overview_i18n jsonb`, `best_seasons_i18n jsonb`, `seasonal_notes_i18n jsonb`, `hero_media_id uuid fk media_assets`, `status publish_status_enum default 'draft'`, `published_at timestamptz`, `editorial_weight int default 3`, `search_tsv tsvector generated`, `embedding vector(768)`, `deleted_at`.

**`circuits`** — `slug text unique`, `name_i18n jsonb`, `description_i18n jsonb`, `status publish_status_enum`. **`circuit_destinations`** — `circuit_id fk`, `destination_id fk`, `sort_order int`; pk composite.

**`destination_links`** — `destination_id fk`, `nearby_destination_id fk`, `note_i18n jsonb`; pk composite.

**`places`** — `destination_id fk destinations`, `slug text`, `name_i18n jsonb`, `place_type place_type_enum`, `facility_subtype facility_subtype_enum null`, `location geography(Point,4326)`, `address text`, `summary_i18n jsonb`, `opening_schedule jsonb` **(critical)** (shape: `{ "weekly": { "mon": [["06:00","12:00"],["16:00","21:00"]], ... }, "exceptions": [{ "date":"2026-10-12", "hours":[...] | "closed":true, "note_i18n":{} }] }`), `closure_rules_i18n jsonb` **(critical)**, `entry_requirements_i18n jsonb` **(critical)**, `dress_code_i18n jsonb`, `visit_duration_min_minutes int`, `visit_duration_likely_minutes int`, `visit_duration_max_minutes int`, `crowd_pattern jsonb` (`{ "morning":"high","midday":"medium","evening":"high" }`), `hours_note_i18n jsonb`, `editorial_weight int default 3`, `status publish_status_enum`, `published_at`, `search_tsv tsvector generated`, `embedding vector(768)`, `deleted_at`. Unique (`destination_id`,`slug`). GiST index on `location`.

**`accessibility_records`** — `place_id fk places unique` (or `route_id fk routes`), `step_free text check in ('yes','no','partial')`, `wheelchair_access text check same`, `queue_assistance boolean`, `rest_seating boolean`, `distance_from_dropoff_m int`, `notes_i18n jsonb`.

**`experiences`** — `place_id fk places null`, `route_id fk routes null` (check exactly one non-null), `destination_id fk destinations`, `slug text`, `name_i18n jsonb`, `experience_type experience_type_enum`, `significance_i18n jsonb`, `description_i18n jsonb`, `duration_min_minutes int`, `duration_likely_minutes int`, `duration_max_minutes int`, `advance_booking_required boolean default false` **(critical)**, `advance_booking_how_i18n jsonb` **(critical)**, `advance_booking_opens_days_before int`, `eligibility_i18n jsonb`, `cost_note_i18n jsonb`, `queue_expectation_i18n jsonb`, `preparation_i18n jsonb`, `is_outdoor boolean default false`, `editorial_weight int default 3`, `status publish_status_enum`, `published_at`, `search_tsv tsvector generated`, `embedding vector(768)`, `deleted_at`.

**`availability_rules`** — `experience_id fk experiences`, `kind availability_kind_enum`, `daily_times jsonb` (`[{"start":"06:00","end":"07:30"}]`), `weekly_pattern jsonb` (`{"mon":[...],"tue":[...]}`), `date_start date`, `date_end date`, `calendar_dates date[]`, `season_label_i18n jsonb`, `capacity_note_i18n jsonb`, `priority int default 1` (higher overrides lower when overlapping), `valid_from date`, `valid_to date`. All rows **(critical)**.

**`routes`** — `destination_id fk`, `slug text`, `name_i18n jsonb`, `mode travel_mode_enum`, `distance_m int`, `duration_min_minutes int`, `duration_likely_minutes int`, `duration_max_minutes int`, `difficulty difficulty_enum`, `elevation_note_i18n jsonb`, `geometry jsonb` (GeoJSON LineString, optional), `status publish_status_enum`, `deleted_at`. **`route_places`** — `route_id fk`, `place_id fk`, `sort_order int`, `is_rest_point boolean`; pk composite.

**`transport_connections`** — `destination_id fk`, `from_place_id fk places null`, `from_destination_id fk destinations null`, `to_place_id fk null`, `to_destination_id fk null`, `mode travel_mode_enum`, `duration_likely_minutes int` **(critical)**, `duration_max_minutes int`, `frequency_note_i18n jsonb`, `operator text`, `booking_note_i18n jsonb`, `seasonal_note_i18n jsonb`, `status publish_status_enum`.

**`travel_estimates`** (cache) — `from_place_id uuid`, `to_place_id uuid`, `mode travel_mode_enum`, `distance_m int`, `duration_seconds int`, `provider text`, `computed_at timestamptz`; pk (`from_place_id`,`to_place_id`,`mode`).

**`guidance_blocks`** — `guidance_type guidance_type_enum`, `body_i18n jsonb`, `applies_to_table text check in ('destinations','places','experiences')`, `applies_to_id uuid`, `sort_order int`, `status publish_status_enum`, `deleted_at`.

**`media_assets`** — `storage_path text`, `media_type text check in ('image','audio','video')`, `width int`, `height int`, `caption_i18n jsonb`, `credit text`, `licence text`, `uploaded_by uuid`, `deleted_at`. **`entity_media`** — `media_id fk`, `entity_table text`, `entity_id uuid`, `role text check in ('hero','gallery','map','audio')`, `sort_order int`; pk (`media_id`,`entity_table`,`entity_id`).

**`phrases`** — `destination_id fk null` (null = universal), `context_tag text check in ('directions','queue','facilities','medical','dietary','greeting','help')`, `source_locale text fk locales`, `source_text text`, `translations jsonb` (`{ "te": {"text":"...","transliteration":"..."} }`), `audio_media_id uuid fk media_assets null`, `sort_order int`, `status publish_status_enum`.

**`advisories`** — `destination_id fk`, `title_i18n jsonb`, `body_i18n jsonb`, `severity text check in ('info','caution','important')`, `starts_at timestamptz`, `ends_at timestamptz`, `source_id fk sources`, `status publish_status_enum`, `published_by uuid`.

**`live_feed_configs`** — `destination_id fk`, `feed_kind text check in ('weather','transport','closure','availability','road')`, `provider text`, `config jsonb`, `refresh_minutes int`, `is_enabled boolean`. **`live_feed_readings`** — `feed_config_id fk`, `read_at timestamptz`, `payload jsonb`, `status text check in ('ok','stale','unavailable')`, `affects_entity_ids uuid[]`.

**Published views (traveler reads only these):** `v_published_destinations`, `v_published_places`, `v_published_experiences`, `v_published_availability_rules`, `v_published_routes`, `v_published_transport_connections`, `v_published_guidance_blocks`, `v_published_phrases`, `v_published_advisories`. Each joins its trust records into a `trust jsonb` column: `{ "<field_name|entity>": { "confidence", "freshness", "verified_at", "valid_until", "source_name", "source_tier_label", "conflict_flag" } }` and filters `status='published' and deleted_at is null` with critical-field trust `verification_status >= human_reviewed`.

### 4.5 Users, roles, personalization
**`profiles`** — `id uuid pk fk auth.users`, `display_name text`, `locale text fk locales default 'en'`, `timezone text default 'Asia/Kolkata'`, `notification_prefs jsonb` (keys = `notification_type_enum`, boolean), `onboarding_completed boolean`, `deleted_at`.

**`user_roles`** — `user_id fk auth.users`, `role ops_role_enum`, `granted_by uuid`, `granted_at`; pk (`user_id`,`role`).

**`traveler_profiles`** — `owner_user_id fk auth.users`, `label text`, `mobility mobility_enum default 'full'`, `age_band age_band_enum default 'adult'`, `dietary_tags text[]`, `locale text`, `is_self boolean default false`, `deleted_at`. (Sensitive: RLS owner-only; excluded from all Ops views and analytics.)

**`saved_places`** — `user_id fk`, `place_id fk places`, `created_at`; pk composite.

**`personalization_signals`** — `user_id fk`, `signal_type text check in ('tier_set','preference_set','item_kept','item_removed','pace_changed','experience_completed')`, `entity_table text`, `entity_id uuid`, `value jsonb`, `journey_id uuid`, `created_at`.

### 4.6 Journeys
**`journeys`** — `owner_user_id fk auth.users null` (null = guest draft synced later), `device_draft_id text null`, `title text`, `status journey_status_enum default 'draft'`, `start_date date`, `end_date date`, `timezone text default 'Asia/Kolkata'`, `day_start_time time default '06:00'`, `day_end_time time default '21:00'`, `pace pace_enum default 'balanced'`, `structure text check in ('structured','flexible') default 'structured'`, `walking_tolerance text check in ('low','medium','high')`, `transport_preference text check in ('own_vehicle','public','hired','walk_where_possible')`, `brief jsonb` (confirmed Journey Brief from F3), `health_state health_state_enum`, `health_report jsonb` (last engine output), `knowledge_snapshot_at timestamptz`, `active_day_index int`, `completed_at timestamptz`, `deleted_at`.

**`journey_destinations`** — `journey_id fk`, `destination_id fk`, `sort_order int`; pk composite.

**`journey_travelers`** — `journey_id fk`, `traveler_profile_id fk traveler_profiles`; pk composite.

**`journey_items`** — `journey_id fk`, `day_index int` (0-based), `sort_order int`, `item_type journey_item_type_enum`, `tier priority_tier_enum`, `title_override text`, `experience_id fk experiences null`, `place_id fk places null`, `route_id fk routes null`, `transport_connection_id fk null`, `fixed_start_at timestamptz null` (required when tier=fixed), `fixed_end_at timestamptz null`, `preferred_window_start time null`, `preferred_window_end time null`, `planned_start_at timestamptz` (engine output), `planned_end_at timestamptz`, `duration_likely_minutes int`, `duration_max_minutes int`, `travel_mode travel_mode_enum null`, `travel_from_item_id uuid null`, `buffer_minutes int default 15`, `note text`, `prep_requirements jsonb` (copied from knowledge at add time), `status text check in ('planned','in_progress','done','skipped','moved') default 'planned'`, `actual_start_at timestamptz`, `actual_end_at timestamptz`, `deleted_at`. Index (`journey_id`,`day_index`,`sort_order`).

**`journey_item_dependencies`** — `item_id fk journey_items`, `after_item_id fk journey_items`; pk composite.

**`journey_change_events`** — `journey_id fk`, `trigger change_trigger_enum`, `trigger_payload jsonb`, `impact jsonb` (engine classification), `change_card jsonb` (options presented), `chosen_option_index int null` (null = keep as is / dismissed), `applied_changes jsonb`, `created_at`, `decided_at`.

**`prepare_tasks`** — `journey_id fk`, `group_name text check in ('bookings','documents','carry','know','travelers','downloads')`, `title_i18n jsonb`, `body_i18n jsonb`, `source_item_id uuid fk journey_items null`, `trust_ref jsonb`, `due_at timestamptz null`, `is_done boolean default false`, `done_at`, `sort_order int`.

**`journey_records`** — `journey_id fk unique`, `summary jsonb` (completed vs planned per item), `reflection_answers jsonb` (`{ "most_meaningful": "", "do_differently": "", "got_wrong": "" }`), `created_at`.

**`journey_item_notes`** — `item_id fk journey_items`, `user_id fk`, `body text`, `media_id uuid fk media_assets null`, `created_at`.

**`journey_shares`** — `journey_id fk`, `token text unique`, `expires_at timestamptz`, `created_by uuid`.

### 4.7 Reports, notifications, analytics
**`user_reports`** — `user_id fk null` (pseudonymised in Ops via `reporter_hash text`), `report_type report_type_enum`, `entity_table text`, `entity_id uuid`, `field_name text null`, `description text` (≤500), `media_id uuid fk media_assets null` (bucket `reports`), `journey_id uuid null`, `locale text`, `client_created_at timestamptz`, `status report_status_enum default 'new'`, `resolution_note text`, `resolved_by uuid`, `resolved_at`, `notified_user boolean default false`.

**`notification_subscriptions`** — `user_id fk`, `endpoint text unique`, `keys jsonb` (`{p256dh, auth}`), `user_agent text`, `created_at`, `last_success_at`, `failure_count int default 0`.

**`notifications`** — `user_id fk`, `notification_type notification_type_enum`, `title_i18n jsonb`, `body_i18n jsonb`, `journey_id uuid null`, `payload jsonb` (deep link, change_event_id, etc.), `scheduled_for timestamptz`, `sent_at timestamptz`, `read_at timestamptz`, `channel text check in ('push','inapp','email')`, `status text check in ('scheduled','sent','failed','cancelled')`.

**`analytics_events`** — `event_name text`, `anon_session_id text`, `journey_id uuid null`, `destination_id uuid null`, `properties jsonb` (no PII — enforced by allowlist in code), `locale text`, `is_offline boolean`, `created_at`. Never stores `user_id`.

**`feature_flags`** — `key text pk`, `is_enabled boolean`, `destination_ids uuid[] null`, `description text`.

**`pending_actions`** (client-side Dexie only, M3) — `id`, `action_type` (`report_create`, `item_status_update`, `change_decision`), `payload`, `created_at`, `attempts`.

### 4.8 Dexie (IndexedDB) stores — `apps/web/lib/offline/db.ts`
`journeys` (key `id`), `journey_items` (key `id`, index `journey_id`), `knowledge_entities` (key `[entity_table+id]`, index `journey_id`), `phrases` (key `id`, index `destination_id`), `prepare_tasks` (key `id`, index `journey_id`), `meta` (key `key`: `last_sync_at`, `snapshot_version`), `pending_actions` (M3). Snapshot written by `syncJourneyOffline(journeyId)` whenever a journey is saved or opened online.

### 4.9 RLS summary
| Table group | Anonymous | Authenticated traveler | Ops role |
|---|---|---|---|
| `v_published_*`, `locales`, `phrases` (published) | read | read | read |
| Base knowledge tables, sources, trust, captures, tasks, conflicts, versions, audit | none | none | by role (researcher/editor write drafts; reviewer/verifier/approver per queue; admin all) |
| `profiles`, `traveler_profiles`, `saved_places`, `personalization_signals` | none | own rows (`auth.uid() = user_id`) | none (admin: `profiles` only, no `traveler_profiles`) |
| `journeys` + child tables | none | own rows; `journey_shares` token read via RPC | none (aggregate counts via RPC only) |
| `user_reports` | none | insert + read own | support/verifier/editor/admin read/update (reporter_hash only) |
| `notifications`, `notification_subscriptions` | none | own rows | none |
| `analytics_events` | insert | insert | admin read |

Service-role key is used only inside Edge Functions and server-side route handlers, never shipped to the client.

---

## 🔌 5. API DESIGN

Conventions: traveler app reads knowledge directly via Supabase client against `v_published_*` views (RLS-protected, cacheable). Anything with business logic, AI, or secrets goes through Next.js Route Handlers under `apps/web/app/api/**` or `apps/ops/app/api/**`. All inputs validated with Zod in `packages/db/schemas/*`. All responses `{ ok: true, data } | { ok: false, error: { code, message } }`. Errors never expose stack traces. Every route checks `auth.uid()` and, for Ops, the required role.

### 5.1 Journey Engine (pure functions in `packages/journey-engine`, no network)
| Function | Purpose | Input | Output |
|---|---|---|---|
| `buildInitialJourney` | Turn a confirmed brief into day-assigned items | `{ brief: JourneyBrief, knowledge: KnowledgeBundle, travelers: TravelerProfile[] }` | `{ items: JourneyItem[], health: HealthReport }` |
| `scheduleDay` | Assign `planned_start_at/end_at` to items for one day respecting FIXED anchors, availability, dependencies, buffers, travel legs | `{ journey, dayIndex, items, knowledge, travelEstimates }` | `{ items, warnings[] }` |
| `computeHealth` | PRD F5 | `{ journey, items, knowledge, travelers, travelEstimates }` | `HealthReport { journeyState, days: [{ dayIndex, state, timeLoadPct, causes: Cause[], trustExposure: TrustCause[] }] }` |
| `evaluateChange` | PRD F6 impact + option ladder | `{ journey, items, knowledge, travelers, trigger: ChangeTrigger, nowAt }` | `ChangeCard { whatChanged_i18nKey, whyItMatters, recommended: Option, options: Option[], keepAsIs: { resultingState } }` |
| `applyOption` | Apply a chosen option to items | `{ items, option }` | `{ items, appliedChanges }` |
| `getNowNextLater` | Live Journey projection | `{ journey, items, knowledge, nowAt }` | `{ now: LiveCard, next: LiveCard, later: LaterRow[], dayState, leaveByAt }` |
| `computeBuffer` | Buffer minutes for a transition | `{ baseMinutes: 15, travelers }` | `number` (×1.5 senior/limited, ×2 wheelchair/rest) |
| `checkReturnGuard` | Ensure last FIXED is reachable | `{ items, travelEstimates }` | `{ ok, requiredDepartureAt, breachMinutes }` |
| `generatePrepareTasks` | PRD F7 | `{ items, knowledge, travelers, locale }` | `PrepareTask[]` |
| `resolveAvailability` | Is an experience available on date/time? | `{ rules: AvailabilityRule[], date, time? }` | `{ available, windows: [{start,end}], reason }` |

`KnowledgeBundle` = `{ places, experiences, availability_rules, routes, transport_connections, guidance_blocks, trust }` — exactly the Dexie snapshot, so the engine is identical online and offline.

### 5.2 Traveler API (`apps/web/app/api/…`)
| Function (route) | Purpose | Input | Output |
|---|---|---|---|
| `POST /api/intent/extract` | F3 AI extraction to Journey Brief, constrained to published IDs | `{ text, locale, destinationHint? }` | `{ brief: JourneyBrief, suggested: string[], unclear: Question[], unmatched: string[] }` |
| `POST /api/journeys` | Create journey from brief (runs `buildInitialJourney` server-side once, then persists) | `{ brief, travelerProfileIds, deviceDraftId? }` | `{ journeyId }` |
| `GET /api/journeys/:id/snapshot` | Full offline bundle | — | `{ journey, items, dependencies, knowledge: KnowledgeBundle, phrases, prepareTasks, snapshotAt }` |
| `PATCH /api/journeys/:id` | Update preferences/dates | partial journey | `{ journey, health }` |
| `POST /api/journeys/:id/items` | Add item (copies prep requirements, default tier `important`) | `{ experienceId|placeId, tier, dayIndex? }` | `{ items, health }` |
| `PATCH /api/journeys/:id/items/:itemId` | Tier, move, window, note, dependency | partial item + `{ dependencies? }` | `{ items, health }` |
| `DELETE /api/journeys/:id/items/:itemId` | Remove (soft) | — | `{ items, health }` |
| `POST /api/journeys/:id/reorder` | Drag-and-drop result | `{ dayIndex, orderedItemIds }` | `{ items, health }` |
| `POST /api/journeys/:id/change` | Persist a trigger + card (client computed offline, or server computes) | `{ trigger, triggerPayload, changeCard?, nowAt }` | `{ changeEventId, changeCard }` |
| `POST /api/journeys/:id/change/:eventId/decide` | Apply chosen option | `{ chosenOptionIndex | null }` | `{ items, health }` |
| `POST /api/journeys/:id/items/:itemId/status` | Done / in_progress / skipped with actual times | `{ status, at }` | `{ items, changeCard? }` |
| `POST /api/journeys/:id/start-day` | Activate Live mode | `{ dayIndex }` | `{ journey }` |
| `POST /api/journeys/:id/complete` | Create `journey_records` | — | `{ record }` |
| `POST /api/journeys/:id/share` | Create share token | `{ expiresInDays: 30 }` | `{ url }` |
| `GET /api/share/:token` | Public read-only summary | — | `{ summary }` |
| `POST /api/journeys/:id/clone` | "Plan a similar journey" | — | `{ journeyId }` |
| `GET /api/travel-estimate` | Cached travel leg | `{ fromPlaceId, toPlaceId, mode }` | `{ distanceM, durationSeconds, provider, cachedAt }` |
| `GET /api/search` | F2 search (tsvector M1; hybrid with pgvector M3) | `{ q, destinationId?, filters, journeyId?, locale }` | `{ experiences[], places[], destinations[] }` (journey-fit flag) |
| `GET /api/live/:destinationId` | Weather + enabled feeds, with provider/timestamp | — | `{ feeds: [{ kind, provider, readAt, status, data }] }` |
| `POST /api/reports` | Create user report | `{ reportType, entityTable, entityId, fieldName?, description, journeyId?, clientCreatedAt }` | `{ reportId }` |
| `POST /api/push/subscribe` / `DELETE` | Register device | `{ subscription }` | `{ ok }` |
| `POST /api/analytics` | Batch events (allowlisted names) | `{ events[] }` | `{ ok }` |
| `POST /api/account/export` | DPDP export | — | `{ downloadUrl }` (signed, 24 h) |
| `POST /api/account/delete` | Schedule deletion (30 d) | `{ confirm: true }` | `{ scheduledFor }` |
| `POST /api/auth/migrate-draft` | Move guest draft to account | `{ deviceDraftId }` | `{ journeyId }` |

### 5.3 Ops API (`apps/ops/app/api/…`, role-gated)
| Function (route) | Purpose | Input | Output |
|---|---|---|---|
| `POST /api/ops/entities/:table` · `PATCH /:id` · `DELETE /:id` | CRUD for `destinations`, `places`, `experiences`, `availability_rules`, `routes`, `transport_connections`, `guidance_blocks`, `phrases`, `advisories`, `accessibility_records` | entity payload (Zod per table) | `{ entity, validation: Issue[] }` + `entity_versions` row |
| `POST /api/ops/entities/:table/:id/trust` | Upsert trust record for a field | `{ fieldName, sourceId, verificationStatus, validUntil?, evidenceUrl?, evidenceExcerpt? }` | `{ trustRecord }` |
| `POST /api/ops/entities/:table/:id/submit` | Draft → `in_review`, opens review task | — | `{ task }` |
| `POST /api/ops/tasks/:id/decide` | Review/verify/conflict/report decision | `{ decision, reason, edits? }` | `{ task, nextTask? }` |
| `POST /api/ops/entities/:table/:id/validate` | Run publish validation rules | — | `{ ok, issues[] }` |
| `POST /api/ops/entities/:table/:id/publish` | Approver only; blocks on issues; computes impact | `{ scheduledFor? }` | `{ published, affectedJourneyCount, notificationPreview }` |
| `POST /api/ops/entities/:table/:id/restore/:version` | Admin restore | — | `{ entity }` |
| `POST /api/ops/sources` · `PATCH /:id` | Source registry | source payload | `{ source }` |
| `POST /api/ops/sources/:id/ingest` | Manual run | `{ fileUpload? }` | `{ jobId }` |
| `POST /api/ops/extractions/:captureId` | Run AI extraction on a capture | `{ targetTables[] }` | `{ extractionId, proposedCount }` |
| `POST /api/ops/extractions/:id/accept` | Create drafts/candidates from accepted proposals | `{ acceptedIndexes[], edits }` | `{ createdEntityIds, candidateIds }` |
| `GET /api/ops/freshness` | Monitor | `{ filter: stale|aging|expiring30|low|conflict, destinationId? }` | `{ rows[] }` |
| `POST /api/ops/freshness/assign` | Bulk reverify tasks | `{ trustRecordIds[], assignTo }` | `{ taskIds }` |
| `POST /api/ops/media` | Upload (sharp resize to 1600/800/400) | multipart | `{ mediaId, variants }` |
| `POST /api/ops/translate/suggest` | AI draft for a locale | `{ entityTable, entityId, field, targetLocale }` | `{ draft, status:'ai_draft' }` |
| `POST /api/ops/locales` | Add locale | `{ code, nameNative, nameEn, script }` | `{ locale }` |
| `GET /api/ops/dashboard` | F20 metrics | — | `{ knowledgeHealth, queues, productSignals }` |
| `POST /api/ops/users/:id/roles` | Grant/revoke | `{ roles[] }` | `{ roles }` |

### 5.4 Background jobs
| Job | Runner | Schedule | Work |
|---|---|---|---|
| `recompute_freshness` | pg_cron | daily 02:00 IST | Update `trust_records.freshness`, `confidence`; create `reverify` tasks for stale criticals; flip `report_downgrade` when ≥3 reports/14 d |
| `ingest_sources` | Supabase Edge Function (scheduler) | per `refresh_cadence_days` | Fetch URL/API → `source_captures` → diff → `change_candidates` + review tasks |
| `refresh_live_feeds` | Edge Function | per `refresh_minutes` (Open-Meteo 60 min) | Write `live_feed_readings`; mark `stale` if provider fails; raise `knowledge_update`/`live_*` triggers for affected active journeys |
| `schedule_notifications` | Edge Function | every 15 min | Create `notifications` for prepare deadlines, journey-tomorrow, leave-by (server fallback; client also schedules local) |
| `send_notifications` | Edge Function | every 5 min | Web Push via `PushProvider`; retry ×3; disable subscription after 5 failures |
| `journey_status_roller` | pg_cron | hourly | draft→upcoming (has dates), upcoming→active (start_date today), active→completed (end_date passed + 24 h) |
| `account_deletion` | pg_cron | daily | Hard-delete accounts scheduled >30 d |
| `keepalive` | Vercel Cron | daily | Tiny query to prevent Supabase free-tier pause |

### 5.5 Graceful degradation matrix
| Dependency fails | Behaviour |
|---|---|
| AI provider (timeout 12 s, 1 retry, then fallback provider if configured) | F3: show structured form with "We couldn't read that — answer a few questions instead"; explanations use template strings (engine already produces `because` keys, AI only rewords) |
| Routing provider | Use `travel_estimates` cache → else PostGIS straight-line × factor (walk 1.3 ×/4.5 km/h; vehicle 1.4 ×/25 km/h) labelled "estimated" |
| Map tiles | Show place list with distances; "Open in Maps" still works |
| Weather/live feed | Label "Live update unavailable — showing last known (as of …)"; badge → Check locally |
| Supabase unreachable | Read from Dexie; banner "Offline — using saved information (as of …)"; writes disabled (M1) / queued (M3) |
| Email provider | Magic link retry; Google sign-in remains; status page link |
| Push delivery | In-app `notifications` row still shown on next open |
| Sentry | No user impact |

---

## 🔒 6. SECURITY & RATE LIMITING

### 6.1 Protected surfaces
- All traveler data (journeys, travelers, reports, notifications) behind RLS `auth.uid()`; `traveler_profiles` additionally excluded from every Ops query, export, and analytics path (enforced by the absence of any policy for ops roles).
- Ops routes require `user_roles` membership checked server-side via `requireRole(['editor','approver'])` helper; UI hiding is never the only control.
- Separation of duties: `review_tasks` decision rejects if `completed_by` = entity's last `changed_by` for `approve` tasks.
- Supabase service-role key only in server env (`SUPABASE_SERVICE_ROLE_KEY`); anon key in client with RLS.
- Secrets via Vercel/Supabase env; `.env.example` committed, never real values.
- Storage: `media` public-read (licensed content only); `reports`, `captures` private, signed URLs 15 min.
- CSP headers (Next `headers()`): `default-src 'self'`; script `'self'` + Vercel analytics; img `'self' data: *.supabase.co *.maptiler.com`; connect `'self' *.supabase.co api.openrouteservice.org api.open-meteo.com`.
- `journey_shares` tokens: 32-byte random, expiring, revocable; share page excludes traveler profiles and notes.
- Audit: every Ops mutation writes `audit_log` via DB trigger; `ip_hash` = SHA-256(ip + daily salt).
- Input limits: report description 500 chars; intent text 1,000 chars; uploads 5 MB, image types only.
- Dependency hygiene: `pnpm audit` in CI; Dependabot weekly.

### 6.2 Rate limits (Upstash-free approach: Postgres table `rate_limits` keyed by `(scope, key, window_start)`, checked in a shared `rateLimit()` helper; swap to `@upstash/ratelimit` if needed)
| Scope | Key | Limit |
|---|---|---|
| `intent_extract` | user or anon session | 10 / hour, 30 / day |
| `search` | user/anon | 60 / minute |
| `journeys_write` | user | 120 / hour |
| `reports_create` | user | 5 / hour, 20 / day |
| `share_create` | user | 10 / day |
| `push_subscribe` | user | 10 / day |
| `analytics` | session | 300 / hour |
| `auth_magic_link` | email | 5 / hour (Supabase + app-side) |
| `ops_ai_extract` | ops user | 60 / day |
| `ops_translate_suggest` | ops user | 200 / day |
| `travel_estimate` (external call) | global | 1,500 / day (under ORS 2,000), cache-first |

Exceeded → HTTP 429 with `Retry-After`; UI copy: "Please try again in a few minutes."

---

## 🤖 7. AI INTEGRATION

### 7.1 Provider abstraction (`packages/providers/ai`)
Interface `AiProvider` with methods `extractIntent`, `explain`, `extractKnowledge`, `detectChanges`, `suggestTranslation`, `classify`, `embed`. Implemented once over the Vercel AI SDK; concrete model chosen by env:
`AI_PROVIDER=google|anthropic|openai`, `AI_MODEL_FAST=gemini-2.5-flash-lite`, `AI_MODEL_STRUCTURED=gemini-2.5-flash`, `AI_MODEL_QUALITY=claude-sonnet-4-6`, `AI_FALLBACK_PROVIDER=anthropic`, `AI_EMBED_MODEL=text-embedding-004`.

### 7.2 Tasks and how each is called
| Task | Model tier | Method | Grounding |
|---|---|---|---|
| Intent → Journey Brief (F3) | structured | `generateObject` with Zod `JourneyBriefSchema` | Prompt receives `candidateExperiences[] {id, name_i18n, type}` for the destination (max 200, from published view); schema enums restrict `experienceId` to that list; free-text mentions not matched go to `unmatched[]`; inferred values flagged `suggested:true` |
| Clarifying questions | structured | same call, `unclear[]` field | Only about items in candidate list |
| Explanation rewording (F6/F9) | fast | `generateText`, temperature 0.3, max 60 tokens | Input is the engine's structured reason; output may not add facts (post-check: no numbers/times not present in input, else use template) |
| Search query understanding (F2) | fast | `generateObject` → `{ filters, keywords }` | Filters limited to schema enums |
| Conversational planning (M5) | quality | `streamText` with tools `searchKnowledge`, `addItem`, `setTier` | Tools only return published IDs; the model cannot emit a timing not returned by a tool |
| Ops knowledge extraction (F17) | structured | `generateObject` with `ExtractionSchema` (array of proposed entities, each field `{value, confidence, excerpt}`) | Output stored as `ai_extractions`; every proposed field must cite an `excerpt` that string-matches the capture, else dropped |
| Change detection summary | fast | `generateText` over diff | Ops-facing only |
| Contradiction/missing detection | structured | `generateObject` → `{ issues[] }` | Ops-facing only |
| Translation draft (F19) | structured | `generateObject` → `{ translation, transliteration? }` | Status `ai_draft` until translator confirms |
| Embeddings (M3) | embed | `embed` on `name + significance + description` (en) | Stored in `embedding`; hybrid search = 0.6 vector + 0.4 tsvector rank |

### 7.3 Hard rules enforced in code (not just prompts)
1. Any user-facing AI output that mentions a timing, date, requirement, price, or availability is rejected unless those values appear in the grounding input (`assertGrounded()` helper).
2. AI can never write to knowledge tables; it writes only to `ai_extractions`, `change_candidates`, or `ui_strings`/`_i18n` with status `ai_draft`.
3. AI-generated text in the app is rendered with the "Mandhira summary" label and never with a Verified badge.
4. Prompt + output logged to `ai_calls` (`task`, `provider`, `model`, `tokens_in`, `tokens_out`, `latency_ms`, `grounding_hash`, `ok`, `created_at`) with no user identifiers.
5. Timeout 12 s, one retry, then fallback provider, then deterministic fallback (Section 5.5).
6. Cache: identical `(task, grounding_hash, input_hash)` within 24 h returns cached output (`ai_cache` table) — keeps Gemini free-tier usage low.

---

## 🚀 8. DEPLOYMENT STRATEGY

1. **Repos & accounts:** GitHub repo `mandhira` (private); Vercel account linked; Supabase project `mandhira-prod` (region `ap-south-1` Mumbai); Resend account + verified sending domain; Google Cloud project only for OAuth client + Gemini key; MapTiler and ORS free keys.
2. **Local setup:** `supabase init` → `supabase start` (Docker) for local Postgres; `supabase/migrations/*.sql` is the single source of schema truth; `supabase gen types typescript --local > packages/db/types.ts` on every migration.
3. **Environments:** `local` (Supabase local), `preview` (Vercel preview deployments pointing at a `mandhira-staging` Supabase project created only when needed; until then previews use local-only features), `production`.
4. **Env vars (both apps):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `AI_*` (7.1), `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY` (optional), `OPENROUTESERVICE_API_KEY`, `NEXT_PUBLIC_MAPTILER_KEY`, `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_DSN`, `CRON_SECRET`.
5. **Supabase config:** enable extensions (`postgis`, `pg_cron`, `vector`, `pg_trgm`, `unaccent`); Auth → Email (magic link, OTP expiry 10 min), SMTP = Resend, Google provider, redirect URLs for local/preview/prod; Storage buckets `media` (public), `reports`, `captures` (private, 5 MB limit); schedule Edge Functions (`supabase functions deploy` + `supabase functions schedule`).
6. **CI (GitHub Actions on PR):** `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` (vitest, engine ≥90% coverage gate) → `supabase db lint` → Playwright smoke on preview URL (Flow 1 + Flow 3) → axe check on 6 key screens.
7. **Deploy:** merge to `main` → Vercel builds `apps/web` (project `mandhira-web`) and `apps/ops` (project `mandhira-ops`, path filter) → migrations applied by a GitHub Action step `supabase db push --linked` before the Vercel build is promoted (Vercel "Ignored Build Step" waits for migration job).
8. **Domains:** dev on `mandhira-web.vercel.app` / `mandhira-ops.vercel.app`; production `app.mandhira.in` (or chosen domain) and `ops.mandhira.in`; Ops additionally behind Vercel Password Protection (Pro) or, on Hobby, an allowlist check on `user_roles` at the root layout plus no public links.
9. **PWA release:** bump `NEXT_PUBLIC_APP_VERSION`; Serwist precache manifest changes → clients get "Update available" toast; never force-reload during Live mode (defer until journey day ends or user taps).
10. **Rollback:** Vercel instant rollback to previous deployment; schema migrations are forward-only and additive (never drop columns in the same release as code that stops using them).
11. **Backups:** Supabase free tier has no PITR → nightly `pg_dump` via GitHub Action to a private repo artifact (encrypted) until Supabase Pro.
12. **Monitoring:** Sentry alerts on error rate; Vercel Analytics web vitals; Supabase log drains reviewed weekly; Ops dashboard queue-age alert (email when any queue item >7 days).

---

## 📊 9. PERFORMANCE REQUIREMENTS

Reference device: Android, ~₹12k class (e.g., 4 GB RAM, Snapdragon 600-series or MediaTek G-series), Chrome, 4G throttled to 1.6 Mbps / 150 ms RTT in Lighthouse.

| Metric | Milestone 1 target | Production target |
|---|---|---|
| First load (Home, cold, 4G) LCP | ≤ 3.0 s | ≤ 2.0 s |
| Repeat load (app shell precached) TTI | ≤ 1.5 s | ≤ 1.0 s |
| Route transition (client nav) | ≤ 300 ms | ≤ 200 ms |
| Initial JS (traveler app, gzipped, per route) | ≤ 180 kB | ≤ 150 kB |
| Live Journey screen from offline cache | ≤ 800 ms | ≤ 500 ms |
| Health recompute (7 days, 60 items, in-browser) | ≤ 500 ms p95 | ≤ 300 ms |
| Change Card generation (evaluateChange) | ≤ 800 ms p95 | ≤ 500 ms |
| Intent extraction (AI round trip) | ≤ 6 s p95, streaming status shown | ≤ 4 s |
| Search response | ≤ 600 ms p95 | ≤ 400 ms |
| Image payload per page | ≤ 400 kB (WebP/AVIF, 800 px max on mobile) | same |
| Animation | 60 fps on reference device; sheets use transform/opacity only; `prefers-reduced-motion` honoured | same |
| Offline snapshot size (3-day journey) | ≤ 5 MB | ≤ 8 MB incl. phrases + audio |
| Lighthouse (mobile) Performance / A11y / PWA | ≥ 80 / ≥ 95 / installable | ≥ 90 / 100 / installable |
| Availability | — | 99.5 % monthly |

**Scalability targets:** 10,000 MAU, 2,000 concurrent Live-mode users, 50 destinations / 5,000 places / 20,000 experiences on Supabase Pro without architectural change; knowledge reads are view-based and cacheable (`Cache-Control: s-maxage=300, stale-while-revalidate=3600` on published content routes); journey writes are per-user row-scoped.

**Techniques mandated:** server components for knowledge pages; dynamic import for map, AI, and Ops-only code; `next/font` with subset for Telugu/Devanagari; route-level code splitting; avoid `moment`, `lodash` full imports; list virtualisation (`@tanstack/react-virtual`) for Ops tables; `React.memo` timeline items; engine runs in a Web Worker (`comlink`) when item count > 40.

---

## 💰 10. COST ESTIMATE

Assumptions: average user creates 1.2 journeys/month, 4 intent extractions, 30 searches, 300 knowledge reads, 2 Live-mode days; images 200 kB avg.

| Service | Free tier | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|---|
| Vercel Hobby/Pro | 100 GB bandwidth, 100 GB-hrs functions, 2 cron | $0 | $0 (≈30 GB) | $20 Pro (bandwidth + crons) |
| Supabase | 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU auth, pauses after 7 idle days | $0 | $0 (DB ≈120 MB; egress ≈3 GB) | $25 Pro (+ $0.09/GB egress over 250 GB, est. $10) |
| Gemini API | 1,500 req/day flash free (varies) | $0 | $0–5 (≈130 req/day with cache) | $30–60 (≈1,300 req/day → paid tier ≈$0.0006/req avg) |
| Anthropic (fallback/quality) | pay-as-you-go | $0 | $0–10 | $20–50 if enabled for explanations |
| MapTiler | 100k tile loads/mo | $0 | $0 (≈40k) | $25 (≈400k) or self-host PMTiles ≈$0–5 |
| OpenRouteService | 2,000 req/day | $0 | $0 (cache hit ≈85 %) | $0 (cache) or $50 Google Routes if quality demands |
| Open-Meteo | free | $0 | $0 | $0 |
| Resend | 3,000 emails/mo | $0 | $0 (≈2,000) | $20 (≈20k) |
| Web Push | free | $0 | $0 | $0 |
| Sentry | 5k errors/mo | $0 | $0 | $0–26 |
| Domain | — | ₹0 (vercel.app) | ₹1,000/yr | ₹1,000/yr |
| **Total / month** | | **$0** | **$0–15** | **≈$150–260** |

Cost controls: AI output cache (24 h), travel-estimate cache (permanent until knowledge changes), image variants pre-generated, knowledge pages edge-cached, Supabase keepalive cron, alert at 70 % of any free quota (Ops dashboard reads provider usage endpoints where available).

---

## 📋 11. DEVELOPMENT CHECKLIST

### 11.1 Roadmap with effort estimates (solo, AI-assisted, ~6 focused hours/day)

| Milestone | Contents (PRD refs) | Estimate | Exit |
|---|---|---|---|
| **M1 — Foundation + vertical slice** | Monorepo, design system, auth, roles, full schema, Ops editors for one destination, trust records, traveler Discovery, Intent (AI), Journey Builder with tiers, Health, Prepare (checklist), NOW/NEXT/LATER, core offline read | **20 working days** (detailed below) | One destination published by Ops; Flow 1, Flow 2 (partial), Flow 3 pass on reference device; airplane-mode read test passes |
| **M2 — Adapt & live** | F6 replanning (user triggers) + Change Card, F15 journey notifications (push + local), F14 text reports + Ops Reports queue, share/print summary, journey status roller | 15 days | Flow 4, Flow 6 (text) pass with 10 pilot planners |
| **M3 — Trusted knowledge at scale** | F17 ingestion + URL monitoring + AI extraction, F18 full queues (Review/Verify/Conflicts/Approve/Freshness/Impact), knowledge-change triggers to journeys, F10 Open-Meteo + 1 transport feed, pgvector hybrid search, offline outbox (`pending_actions`), offline replanning | 25 days | Flow 5, Flow 7 pass; 3 destinations published without engineering |
| **M4 — Language & completion** | te/hi UI + content, phrase packs + audio, translation workspace, F16 Complete & Reflect, F20 dashboards, advisories, report photos, DPDP export/delete | 20 days | Locale completeness ≥95 %; Flow 8 passes |
| **M5 — Ecosystem growth** | Collaborative journeys, conversational assistant (tool-grounded), circuits UX, PMTiles offline maps, partner hand-offs, optional Expo shell reusing `packages/*` | 30+ days | Per-capability DoD |

Total to full product: ≈110–120 focused days. Content entry and verification time is additional and parallelisable with extra Ops contributors.

### 11.2 Milestone 1 — day-by-day (20 days)

**Day 1 — Workspace & foundations**
- Create monorepo (`pnpm`, `turbo`), apps `web` and `ops` (Next 15, TS strict, Tailwind 4), packages `ui`, `db`, `journey-engine`, `providers`, `i18n`, `config`.
- Install shadcn/ui in `packages/ui`; add design tokens as CSS variables (light/dark) from PRD §12.1; fonts (Inter, Fraunces, Noto Sans Telugu/Devanagari via `next/font`).
- GitHub repo, ESLint/Prettier, Vitest + Playwright scaffolds, GitHub Actions (lint/typecheck/test).

**Day 2 — Supabase & schema (part 1)**
- `supabase init/start`; enable extensions. Migration `0001_enums.sql` (all §4.1 enums), `0002_locales_sources_trust.sql` (§4.2, §4.3 tables: `locales`, `ui_strings`, `sources`, `trust_records`, `entity_versions`, `audit_log`, `review_tasks`; leave captures/extractions/conflicts for M3 but create tables now for schema completeness).
- `updated_at` trigger function; `entity_versions` trigger template.

**Day 3 — Schema (part 2): knowledge + users + journeys**
- Migrations `0003_knowledge.sql` (§4.4 all tables, indexes, tsvector generated columns, `embedding` columns), `0004_users.sql` (§4.5), `0005_journeys.sql` (§4.6), `0006_reports_notifications.sql` (§4.7).
- Published views `v_published_*` with `trust jsonb` aggregation.
- Generate types → `packages/db/types.ts`; Zod schemas for `places`, `experiences`, `availability_rules`, `journeys`, `journey_items`.

**Day 4 — RLS, roles, auth**
- RLS policies per §4.9; `user_roles`; SQL helper `has_role(role)`.
- Supabase Auth: magic link (Resend SMTP), Google; `@supabase/ssr` middleware in both apps; `profiles` auto-insert trigger on sign-up.
- Ops root layout gate: redirect unless `has_role` any ops role. Seed an admin user.

**Day 5 — Ops shell & entity editors (destinations, places)**
- Ops layout: sidebar (O01–O22 nav, M1 items active), command palette (`cmdk`), data table component (`@tanstack/react-table`).
- Destination editor (name_i18n tabs per locale, centre picker with MapLibre + Nominatim via `GeocodingProvider`), Places list + editor (type, location pin, opening_schedule builder UI, durations, crowd pattern).
- `POST/PATCH /api/ops/entities/:table` with Zod validation + `entity_versions` + `audit_log`.

**Day 6 — Ops editors (experiences, availability, routes, transport, guidance) + trust panel**
- Experience editor with availability rule builder (all `availability_kind_enum` kinds), prep/booking fields, `is_outdoor`.
- Routes (+ route_places ordering via dnd-kit), transport connections, guidance blocks, accessibility records.
- Inline **Trust panel** on every critical field: source select, verification status, verified_at, valid_until, evidence → `POST …/trust`.
- Sources registry screen (O08, manual method only in M1).

**Day 7 — Validation, submit, publish, media**
- `validate` rules (§F18 list) and `submit`/`publish` routes; `approve` review task with separation-of-duties check; `published_at`.
- Media upload (sharp variants 1600/800/400 → bucket `media`), `entity_media` attach UI.
- Ops preview-as-app link.

**Day 8 — Seed first destination (content day)**
- Enter one real destination: ≥12 places, ≥20 experiences with availability rules, ≥6 routes/transport connections, ≥15 guidance blocks, 5 facilities, trust records on all critical fields (T1/T2 sources), publish through the queue.
- Verify `v_published_*` output and trust jsonb shape.

**Day 9 — Traveler app shell & PWA**
- App layout: bottom nav (Home / Journey / Prepare / Profile), mobile header, theme toggle, locale route prefix (`/[locale]/…`) with `next-intl` (en only strings, te/hi scaffolds).
- Serwist service worker: precache shell, runtime cache `v_published_*` GETs (SWR), images; `manifest.webmanifest` (icons, `display: standalone`, theme `#FF660E`); install prompt component; offline banner component reading `navigator.onLine` + heartbeat.

**Day 10 — Discovery**
- Home (A02), Destination page (A04) with sections per F2, Place page (A05), Experience page (A06), Trust badge + Trust sheet (A18) components reading `trust` jsonb.
- Search (A03) via `/api/search` (tsvector + filters); availability text formatter (`resolveAvailability` from engine for "Next: …").
- Server components + `next/image`; measure LCP on reference device.

**Day 11 — Journey Engine (part 1)**
- Implement `resolveAvailability`, `computeBuffer`, `scheduleDay`, `checkReturnGuard` with Vitest tests (≥30 cases incl. PRD Appendix A).
- `KnowledgeBundle` type matching Dexie snapshot; fixtures from Day 8 data.

**Day 12 — Journey Engine (part 2)**
- `computeHealth` (all 4 states, 5 checks, plain-language `causes` as i18n keys + params), `buildInitialJourney`, `generatePrepareTasks`.
- Web Worker wrapper (`comlink`) for >40 items. Engine coverage ≥90 %.

**Day 13 — Intent capture (AI)**
- `packages/providers/ai` with Vercel AI SDK; `AiProvider.extractIntent` via `generateObject` + `JourneyBriefSchema`; candidate-ID grounding; `assertGrounded`; `ai_calls` + `ai_cache` tables; rate limit helper + `rate_limits` table.
- Screens A07 (text + structured-form link), A08 Brief review with *Suggested* chips and unclear questions, A09 structured form (5 steps). Fallback path when AI fails.

**Day 14 — Journey Builder**
- `POST /api/journeys` (runs `buildInitialJourney`), item CRUD/reorder routes, guest draft in Dexie + migrate on sign-in.
- A10 Days view (dnd-kit timeline, tier chips, travel legs, Health pill), A11 item editor sheet (vaul), A12 Health detail sheet, "Simplify this day" producing a static proposal list (full Change Card arrives in M2).
- Traveler profiles UI (A23 travelers section) and journey_travelers.

**Day 15 — Travel estimates & maps**
- `RoutingProvider` (ORS) + `travel_estimates` cache + PostGIS fallback; `/api/travel-estimate` used by builder for legs.
- Place map (MapLibre, MapTiler tiles) on Place/Destination pages; "Open in Maps" deep link (geo: / Google Maps URL).

**Day 16 — Prepare & summary**
- `prepare_tasks` generation on save; A14 Prepare (groups, Why? expander with trust ref, due dates); A15 Journey Summary page (print CSS, one A4 page per day); share token route + public page (no traveler profiles).

**Day 17 — Live Journey: NOW / NEXT / LATER**
- `getNowNextLater` in engine; A16 screen (NOW card with Done / Running late / Stay longer — M1: Done updates status; Late/Stay record the trigger and show a placeholder "Options coming next" only if health breaks; full Change Card in M2), NEXT with leave-by, LATER list, Health pill; end-of-day card; `start-day` route; local leave-by reminders via `setTimeout` + Notification API while app is open.

**Day 18 — Core offline**
- Dexie schema (§4.8); `syncJourneyOffline` writes snapshot on save/open; React Query persister; read path cache-first for journey, items, knowledge, phrases, prepare tasks; offline banner states ("saved offline as of …"); Live Journey fully functional from Dexie; airplane-mode test.

**Day 19 — Quality pass**
- axe on A02/A04/A06/A10/A14/A16; keyboard and screen-reader labels; 200 % text scale; dark mode check; Lighthouse on reference device profile; bundle analysis (`@next/bundle-analyzer`) to ≤180 kB; Sentry in both apps; `analytics_events` with allowlist; copy review against PRD §12.7.

**Day 20 — Deploy & pilot**
- Supabase prod project (Mumbai), migrations push, buckets, SMTP, OAuth redirects, Edge Function `keepalive`; Vercel projects for `web` and `ops`, env vars, domains; Playwright smoke on prod; nightly backup action; README + runbook; invite 5 pilot planners.

### 11.3 M2–M4 checklist summaries (task-level, not day-level)
- **M2:** `evaluateChange` + option ladder (tests per trigger × tier matrix); `applyOption`; `journey_change_events`; Change Card sheet (A13); item status deltas → triggers; Web Push (VAPID, `notification_subscriptions`, `send_notifications` Edge Function); `schedule_notifications`; journey status roller; user reports (A19, `/api/reports`), Ops Reports queue (O14) with reporter_hash; "Report resolved" notifications; pilot instrumentation.
- **M3:** `ingest_sources` Edge Function (URL fetch, hash, diff, `source_captures`, `change_candidates`); `AiProvider.extractKnowledge` + O09 review UI with excerpt highlighting; queues O10–O13, O15; conflicts auto-detection trigger; impact analysis (affected journeys) + knowledge_update triggers; `refresh_live_feeds` (Open-Meteo) + `/api/live`; `live_feed_readings` → triggers; pgvector embeddings job + hybrid search; `pending_actions` outbox + reconcile card; offline `evaluateChange`.
- **M4:** `ui_strings` → next-intl build step; te/hi content via O17 + `suggestTranslation`; phrase packs + audio (A17); journey completion + reflection (A20/`journey_records`); O01/O22 dashboards (`recharts`); advisories (O19/A25); report photo upload; DPDP export/delete routes and 30-day job.

---

## 🎯 12. TECHNICAL SUCCESS CRITERIA

**Milestone 1 is done when all of the following are true:**
1. `supabase db reset` rebuilds the full schema (all §4 tables, enums, views, RLS, triggers) from migrations with zero errors; generated types compile in both apps.
2. An Ops user with `editor` + `approver` roles can create, trust-annotate, validate, and publish a destination with places, experiences, availability rules, routes, guidance, and media; an attempt to publish with an unverified critical field is blocked naming the field.
3. A different user without ops roles cannot read any base knowledge table or Ops route (verified by automated RLS tests).
4. The traveler app, on the reference device over throttled 4G, loads Home with LCP ≤ 3.0 s and is installable (Lighthouse PWA pass).
5. Flow 1 (intent → brief → journey with tiers → health) completes with ≥85 % brief-field extraction accuracy on a 50-sentence English test set, and zero hallucinated experience IDs (all IDs must exist in `v_published_experiences`).
6. `computeHealth` returns the PRD Appendix A result (Comfortable, 72 % load) and every non-Comfortable state lists ≥1 cause; engine test coverage ≥90 %; recompute ≤500 ms p95 for 60 items.
7. Return guard blocks any plan that breaches the final FIXED item.
8. Every critical field rendered in the traveler app shows a trust badge and opens a trust sheet with source, tier label, verified date, and validity.
9. Prepare checklist is generated with correct grouping and due dates for advance-booking experiences; printable summary fits one A4 page per day.
10. Live Journey shows correct NOW/NEXT/LATER for a seeded 3-day journey at 6 different simulated times; Done advances correctly.
11. Airplane-mode test: journey, items, referenced knowledge, phrases (en), and Live Journey are fully readable with the "saved offline as of …" banner; reconnect revalidates without data loss.
12. axe reports zero serious/critical violations on the six key screens; all status indicators have icon + text; tap targets ≥44 px; 200 % text scale without truncation.
13. Initial JS per traveler route ≤180 kB gzipped; no vendor SDK imported outside `packages/providers`.
14. Sentry receives errors from both apps; `analytics_events` contains no user identifiers (schema test).
15. Production is live on Vercel + Supabase Mumbai with nightly backup artifact, keepalive cron, and a documented runbook; monthly infra cost = $0.

**The full product is done (M5 exit) when,** additionally: the PRD Definition of Done holds for every feature F1–F20; three destinations were published end-to-end by Ops without engineering; te/hi completeness ≥95 %; all Section 9 production targets met; PRD §7 instrumentation is live; and the architecture has required no rewrite of `packages/journey-engine`, the §4 schema (additive migrations only), or the provider abstraction since M1.

---

*End of document.*
