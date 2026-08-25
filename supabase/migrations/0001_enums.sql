-- 0001_enums.sql — TRD §4.1 shared enums (TRD-DB-002).
--
-- Names and values are NORMATIVE: they are referenced verbatim by the journey engine,
-- the API contracts and the UI. Enum values are append-only from here on — adding a value
-- is additive and safe; renaming or removing one is a breaking change requiring a
-- DECISION_LOG entry and a Dexie version bump (CLAUDE.md §4).
--
-- Extensions are enabled first: this is the earliest migration, and later ones (B-004
-- knowledge layer) depend on postgis/vector/pg_trgm being present.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_cron;

-- ── Publishing & trust ────────────────────────────────────────────────────────
create type publish_status_enum as enum ('draft', 'in_review', 'published', 'archived');

create type verification_status_enum as enum (
  'unverified', 'ai_extracted', 'human_reviewed', 'verified', 'disputed'
);

create type source_tier_enum as enum ('T1', 'T2', 'T3', 'T4', 'T5');

create type freshness_enum as enum ('fresh', 'aging', 'stale');

create type confidence_enum as enum ('high', 'medium', 'low');

-- ── Knowledge layer ───────────────────────────────────────────────────────────
create type place_type_enum as enum (
  'temple', 'shrine', 'sacred_site', 'ghat', 'viewpoint',
  'facility', 'transport_point', 'accommodation', 'food'
);

create type facility_subtype_enum as enum (
  'restroom', 'drinking_water', 'cloakroom', 'medical',
  'parking', 'atm', 'rest_area', 'help_desk'
);

create type experience_type_enum as enum (
  'darshan', 'ritual', 'aarti', 'seva', 'festival', 'event', 'walk', 'cultural', 'other'
);

create type availability_kind_enum as enum (
  'always_during_opening', 'daily_fixed_times', 'weekly_pattern',
  'date_range', 'calendar_dates', 'on_request'
);

create type travel_mode_enum as enum ('walk', 'vehicle', 'public_transport', 'hired', 'other');

create type difficulty_enum as enum ('easy', 'moderate', 'hard');

create type guidance_type_enum as enum (
  'before_you_go', 'what_to_carry', 'etiquette', 'timing_tip', 'safety', 'family', 'accessibility'
);

-- ── Journeys ──────────────────────────────────────────────────────────────────
-- Priority tiers drive the engine's option ladder; order here is the tier order.
create type priority_tier_enum as enum ('fixed', 'protected', 'important', 'optional');

create type journey_item_type_enum as enum (
  'experience', 'travel_leg', 'rest', 'meal', 'fixed_commitment', 'free_time'
);

create type journey_status_enum as enum ('draft', 'upcoming', 'active', 'completed', 'archived');

create type health_state_enum as enum ('comfortable', 'tight', 'at_risk', 'broken');

-- ── Travelers & preferences ───────────────────────────────────────────────────
create type mobility_enum as enum (
  'full', 'limited_walking', 'wheelchair', 'needs_rest_frequently'
);

create type age_band_enum as enum ('child', 'adult', 'senior');

create type pace_enum as enum ('relaxed', 'balanced', 'full');

-- ── Reports ───────────────────────────────────────────────────────────────────
create type report_type_enum as enum (
  'timing_changed', 'closed', 'accessibility_issue',
  'wrong_information', 'outdated_guidance', 'other'
);

create type report_status_enum as enum (
  'new', 'triaged', 'verifying',
  'resolved_updated', 'resolved_confirmed_correct', 'resolved_unverifiable', 'closed'
);

-- ── Ops ───────────────────────────────────────────────────────────────────────
create type ops_role_enum as enum (
  'researcher', 'reviewer', 'verifier', 'editor',
  'approver', 'translator', 'media', 'support', 'admin'
);

create type review_task_type_enum as enum (
  'review', 'verify', 'conflict', 'approve', 'report', 'reverify'
);

create type task_status_enum as enum ('open', 'in_progress', 'done', 'rejected');

-- ── Adaptation & notifications ────────────────────────────────────────────────
create type change_trigger_enum as enum (
  'user_late', 'user_done_delta', 'user_stay_longer', 'knowledge_update',
  'live_transport', 'live_weather', 'item_added', 'item_removed',
  'preferences_changed', 'availability_changed'
);

create type notification_type_enum as enum (
  'prepare_deadline', 'journey_tomorrow', 'leave_by',
  'journey_change', 'report_resolved', 'advisory', 'suggestion'
);
