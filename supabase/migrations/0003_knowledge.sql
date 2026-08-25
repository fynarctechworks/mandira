-- 0003_knowledge.sql — TRD §4.4 knowledge layer (TRD-DB-001, TRD-DB-005, PRD-KNOW-001).
--
-- Table order below satisfies foreign keys: media_assets and destinations first, then
-- places/routes, then everything that points at them.
--
-- Conventions (TRD §1.4): snake_case, uuid pks, `_i18n` jsonb for translatable text,
-- created_at/updated_at with triggers, soft delete via deleted_at where the TRD says so.
--
-- Every knowledge table gets the record_entity_version() trigger from 0002 so edits are
-- reconstructable (TRD-DB-004). Attaching it here — rather than per-table bespoke code —
-- is why that function was written as a reusable template.
--
-- Search and embeddings (TRD-DB-005): each searchable table carries a `search_tsv`
-- generated column and an `embedding vector(768)` column. Embeddings stay unused until
-- B-032 (M3); the column exists now so adding semantic search is not a schema migration
-- on a table full of live rows (D-011).

-- ══════════════════════════════════════════════════════════════════════════════
-- Search helper
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Flattens an `_i18n` jsonb object to a single searchable string.
 *
 * Locale-agnostic on purpose: concatenating every value means adding a locale (D-014
 * lists te/hi now, more later) needs no migration and no change to any generated column.
 * ORDER BY key keeps the output deterministic, which IMMUTABLE requires — and IMMUTABLE
 * is what lets this be used inside a generated column at all.
 */
create or replace function i18n_text(p jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(value, ' ' order by key), '')
  from jsonb_each_text(coalesce(p, '{}'::jsonb));
$$;

comment on function i18n_text(jsonb) is
  'Concatenates all locale values of an _i18n jsonb column for full-text indexing.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Media (declared first: destinations.hero_media_id references it)
-- ══════════════════════════════════════════════════════════════════════════════

create table media_assets (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  media_type   text not null check (media_type in ('image', 'audio', 'video')),
  width        int,
  height       int,
  caption_i18n jsonb not null default '{}'::jsonb,
  credit       text,
  licence      text,
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create trigger media_assets_set_updated_at
  before update on media_assets for each row execute function set_updated_at();
alter table media_assets enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Destinations & circuits
-- ══════════════════════════════════════════════════════════════════════════════

create table destinations (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name_i18n           jsonb not null default '{}'::jsonb,
  region              text,
  state               text,
  country             text not null default 'IN',
  centre              geography(Point, 4326),
  radius_km           numeric not null default 5,
  overview_i18n       jsonb not null default '{}'::jsonb,
  best_seasons_i18n   jsonb not null default '{}'::jsonb,
  seasonal_notes_i18n jsonb not null default '{}'::jsonb,
  hero_media_id       uuid references media_assets (id) on delete set null,
  status              publish_status_enum not null default 'draft',
  published_at        timestamptz,
  editorial_weight    int not null default 3,
  embedding           vector(768),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  search_tsv          tsvector generated always as (
                        to_tsvector('simple',
                          i18n_text(name_i18n) || ' ' ||
                          i18n_text(overview_i18n) || ' ' ||
                          coalesce(region, '') || ' ' ||
                          coalesce(state, '')
                        )
                      ) stored
);

create index destinations_search_idx on destinations using gin (search_tsv);
create index destinations_centre_idx on destinations using gist (centre);
create index destinations_status_idx on destinations (status) where deleted_at is null;
create index destinations_name_trgm_idx on destinations
  using gin ((i18n_text(name_i18n)) extensions.gin_trgm_ops);

create trigger destinations_set_updated_at
  before update on destinations for each row execute function set_updated_at();
create trigger destinations_record_version
  after insert or update on destinations for each row execute function record_entity_version();
alter table destinations enable row level security;

create table circuits (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name_i18n        jsonb not null default '{}'::jsonb,
  description_i18n jsonb not null default '{}'::jsonb,
  status           publish_status_enum not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger circuits_set_updated_at
  before update on circuits for each row execute function set_updated_at();
create trigger circuits_record_version
  after insert or update on circuits for each row execute function record_entity_version();
alter table circuits enable row level security;

create table circuit_destinations (
  circuit_id     uuid not null references circuits (id) on delete cascade,
  destination_id uuid not null references destinations (id) on delete cascade,
  sort_order     int not null default 0,
  primary key (circuit_id, destination_id)
);

alter table circuit_destinations enable row level security;

create table destination_links (
  destination_id        uuid not null references destinations (id) on delete cascade,
  nearby_destination_id uuid not null references destinations (id) on delete cascade,
  note_i18n             jsonb not null default '{}'::jsonb,
  primary key (destination_id, nearby_destination_id),
  constraint destination_links_not_self check (destination_id <> nearby_destination_id)
);

alter table destination_links enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Places
-- ══════════════════════════════════════════════════════════════════════════════

create table places (
  id                        uuid primary key default gen_random_uuid(),
  destination_id            uuid not null references destinations (id) on delete cascade,
  slug                      text not null,
  name_i18n                 jsonb not null default '{}'::jsonb,
  place_type                place_type_enum not null,
  facility_subtype          facility_subtype_enum,
  location                  geography(Point, 4326),
  address                   text,
  summary_i18n              jsonb not null default '{}'::jsonb,
  -- CRITICAL fields (TRD §4.4): each carries its own trust record and gates publication.
  opening_schedule          jsonb,
  closure_rules_i18n        jsonb not null default '{}'::jsonb,
  entry_requirements_i18n   jsonb not null default '{}'::jsonb,
  dress_code_i18n           jsonb not null default '{}'::jsonb,
  visit_duration_min_minutes    int,
  visit_duration_likely_minutes int,
  visit_duration_max_minutes    int,
  crowd_pattern             jsonb,
  hours_note_i18n           jsonb not null default '{}'::jsonb,
  editorial_weight          int not null default 3,
  status                    publish_status_enum not null default 'draft',
  published_at              timestamptz,
  embedding                 vector(768),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,
  search_tsv                tsvector generated always as (
                              to_tsvector('simple',
                                i18n_text(name_i18n) || ' ' ||
                                i18n_text(summary_i18n) || ' ' ||
                                coalesce(address, '')
                              )
                            ) stored,
  constraint places_destination_slug_key unique (destination_id, slug),
  -- facility_subtype only means something on a facility.
  constraint places_facility_subtype_requires_facility check (
    facility_subtype is null or place_type = 'facility'
  ),
  constraint places_duration_order check (
    visit_duration_min_minutes is null
    or visit_duration_likely_minutes is null
    or visit_duration_max_minutes is null
    or (visit_duration_min_minutes <= visit_duration_likely_minutes
        and visit_duration_likely_minutes <= visit_duration_max_minutes)
  )
);

comment on column places.opening_schedule is
  'CRITICAL. {"weekly":{"mon":[["06:00","12:00"]],...},"exceptions":[{"date":"2026-10-12","hours":[...]|"closed":true,"note_i18n":{}}]} (TRD §4.4).';
comment on column places.crowd_pattern is '{"morning":"high","midday":"medium","evening":"high"}';

create index places_destination_idx on places (destination_id) where deleted_at is null;
create index places_location_idx on places using gist (location);
create index places_search_idx on places using gin (search_tsv);
create index places_type_idx on places (place_type) where deleted_at is null;
create index places_name_trgm_idx on places
  using gin ((i18n_text(name_i18n)) extensions.gin_trgm_ops);

create trigger places_set_updated_at
  before update on places for each row execute function set_updated_at();
create trigger places_record_version
  after insert or update on places for each row execute function record_entity_version();
alter table places enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Routes
-- ══════════════════════════════════════════════════════════════════════════════

create table routes (
  id                     uuid primary key default gen_random_uuid(),
  destination_id         uuid not null references destinations (id) on delete cascade,
  slug                   text not null,
  name_i18n              jsonb not null default '{}'::jsonb,
  mode                   travel_mode_enum not null,
  distance_m             int,
  duration_min_minutes    int,
  duration_likely_minutes int,
  duration_max_minutes    int,
  difficulty             difficulty_enum,
  elevation_note_i18n    jsonb not null default '{}'::jsonb,
  geometry               jsonb,
  status                 publish_status_enum not null default 'draft',
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  constraint routes_destination_slug_key unique (destination_id, slug),
  constraint routes_duration_order check (
    duration_min_minutes is null
    or duration_likely_minutes is null
    or duration_max_minutes is null
    or (duration_min_minutes <= duration_likely_minutes
        and duration_likely_minutes <= duration_max_minutes)
  )
);

comment on column routes.geometry is 'Optional GeoJSON LineString (TRD §4.4).';

create index routes_destination_idx on routes (destination_id) where deleted_at is null;

create trigger routes_set_updated_at
  before update on routes for each row execute function set_updated_at();
create trigger routes_record_version
  after insert or update on routes for each row execute function record_entity_version();
alter table routes enable row level security;

create table route_places (
  route_id      uuid not null references routes (id) on delete cascade,
  place_id      uuid not null references places (id) on delete cascade,
  sort_order    int not null default 0,
  is_rest_point boolean not null default false,
  primary key (route_id, place_id)
);

alter table route_places enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Accessibility (attaches to a place OR a route)
-- ══════════════════════════════════════════════════════════════════════════════

create table accessibility_records (
  id                       uuid primary key default gen_random_uuid(),
  place_id                 uuid unique references places (id) on delete cascade,
  route_id                 uuid unique references routes (id) on delete cascade,
  step_free                text check (step_free in ('yes', 'no', 'partial')),
  wheelchair_access        text check (wheelchair_access in ('yes', 'no', 'partial')),
  queue_assistance         boolean,
  rest_seating             boolean,
  distance_from_dropoff_m  int,
  notes_i18n               jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint accessibility_records_one_target check (
    (place_id is not null)::int + (route_id is not null)::int = 1
  )
);

create trigger accessibility_records_set_updated_at
  before update on accessibility_records for each row execute function set_updated_at();
create trigger accessibility_records_record_version
  after insert or update on accessibility_records for each row execute function record_entity_version();
alter table accessibility_records enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Experiences & availability
-- ══════════════════════════════════════════════════════════════════════════════

create table experiences (
  id                              uuid primary key default gen_random_uuid(),
  destination_id                  uuid not null references destinations (id) on delete cascade,
  place_id                        uuid references places (id) on delete cascade,
  route_id                        uuid references routes (id) on delete cascade,
  slug                            text not null,
  name_i18n                       jsonb not null default '{}'::jsonb,
  experience_type                 experience_type_enum not null,
  significance_i18n               jsonb not null default '{}'::jsonb,
  description_i18n                jsonb not null default '{}'::jsonb,
  duration_min_minutes            int,
  duration_likely_minutes         int,
  duration_max_minutes            int,
  -- CRITICAL fields (TRD §4.4).
  advance_booking_required        boolean not null default false,
  advance_booking_how_i18n        jsonb not null default '{}'::jsonb,
  advance_booking_opens_days_before int,
  eligibility_i18n                jsonb not null default '{}'::jsonb,
  cost_note_i18n                  jsonb not null default '{}'::jsonb,
  queue_expectation_i18n          jsonb not null default '{}'::jsonb,
  preparation_i18n                jsonb not null default '{}'::jsonb,
  is_outdoor                      boolean not null default false,
  editorial_weight                int not null default 3,
  status                          publish_status_enum not null default 'draft',
  published_at                    timestamptz,
  embedding                       vector(768),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  deleted_at                      timestamptz,
  search_tsv                      tsvector generated always as (
                                    to_tsvector('simple',
                                      i18n_text(name_i18n) || ' ' ||
                                      i18n_text(significance_i18n) || ' ' ||
                                      i18n_text(description_i18n)
                                    )
                                  ) stored,
  constraint experiences_destination_slug_key unique (destination_id, slug),
  -- TRD §4.4: an experience hangs off exactly one of place or route.
  constraint experiences_one_anchor check (
    (place_id is not null)::int + (route_id is not null)::int = 1
  ),
  constraint experiences_duration_order check (
    duration_min_minutes is null
    or duration_likely_minutes is null
    or duration_max_minutes is null
    or (duration_min_minutes <= duration_likely_minutes
        and duration_likely_minutes <= duration_max_minutes)
  )
);

create index experiences_destination_idx on experiences (destination_id) where deleted_at is null;
create index experiences_place_idx on experiences (place_id) where deleted_at is null;
create index experiences_route_idx on experiences (route_id) where deleted_at is null;
create index experiences_search_idx on experiences using gin (search_tsv);
create index experiences_booking_idx on experiences (advance_booking_required)
  where advance_booking_required;
create index experiences_name_trgm_idx on experiences
  using gin ((i18n_text(name_i18n)) extensions.gin_trgm_ops);

create trigger experiences_set_updated_at
  before update on experiences for each row execute function set_updated_at();
create trigger experiences_record_version
  after insert or update on experiences for each row execute function record_entity_version();
alter table experiences enable row level security;

-- Every availability row is CRITICAL (TRD §4.4): the engine schedules against these.
create table availability_rules (
  id                 uuid primary key default gen_random_uuid(),
  experience_id      uuid not null references experiences (id) on delete cascade,
  kind               availability_kind_enum not null,
  daily_times        jsonb,
  weekly_pattern     jsonb,
  date_start         date,
  date_end           date,
  calendar_dates     date[],
  season_label_i18n  jsonb not null default '{}'::jsonb,
  capacity_note_i18n jsonb not null default '{}'::jsonb,
  priority           int not null default 1,
  valid_from         date,
  valid_to           date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint availability_rules_date_order check (
    date_start is null or date_end is null or date_start <= date_end
  ),
  constraint availability_rules_validity_order check (
    valid_from is null or valid_to is null or valid_from <= valid_to
  )
);

comment on column availability_rules.daily_times is '[{"start":"06:00","end":"07:30"}]';
comment on column availability_rules.weekly_pattern is '{"mon":[...],"tue":[...]}';
comment on column availability_rules.priority is
  'Higher priority overrides lower when windows overlap (TRD §4.4).';

create index availability_rules_experience_idx on availability_rules (experience_id, priority desc);

create trigger availability_rules_set_updated_at
  before update on availability_rules for each row execute function set_updated_at();
create trigger availability_rules_record_version
  after insert or update on availability_rules for each row execute function record_entity_version();
alter table availability_rules enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Transport
-- ══════════════════════════════════════════════════════════════════════════════

create table transport_connections (
  id                      uuid primary key default gen_random_uuid(),
  destination_id          uuid not null references destinations (id) on delete cascade,
  from_place_id           uuid references places (id) on delete cascade,
  from_destination_id     uuid references destinations (id) on delete cascade,
  to_place_id             uuid references places (id) on delete cascade,
  to_destination_id       uuid references destinations (id) on delete cascade,
  mode                    travel_mode_enum not null,
  duration_likely_minutes int,  -- CRITICAL (TRD §4.4)
  duration_max_minutes    int,
  frequency_note_i18n     jsonb not null default '{}'::jsonb,
  operator                text,
  booking_note_i18n       jsonb not null default '{}'::jsonb,
  seasonal_note_i18n      jsonb not null default '{}'::jsonb,
  status                  publish_status_enum not null default 'draft',
  published_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- A leg needs exactly one origin and exactly one destination, place or destination.
  constraint transport_connections_one_from check (
    (from_place_id is not null)::int + (from_destination_id is not null)::int = 1
  ),
  constraint transport_connections_one_to check (
    (to_place_id is not null)::int + (to_destination_id is not null)::int = 1
  ),
  constraint transport_connections_duration_order check (
    duration_likely_minutes is null
    or duration_max_minutes is null
    or duration_likely_minutes <= duration_max_minutes
  )
);

create index transport_connections_destination_idx on transport_connections (destination_id);
create index transport_connections_from_idx on transport_connections (from_place_id, to_place_id);

create trigger transport_connections_set_updated_at
  before update on transport_connections for each row execute function set_updated_at();
create trigger transport_connections_record_version
  after insert or update on transport_connections for each row execute function record_entity_version();
alter table transport_connections enable row level security;

/*
 * Routing-provider cache (TRD §4.4). Not knowledge and not trust-bearing: it holds
 * computed travel times so the ORS free tier is not re-hit for the same leg
 * (TRD §3 paid-dependency register). No version trigger — it is disposable.
 */
create table travel_estimates (
  from_place_id    uuid not null,
  to_place_id      uuid not null,
  mode             travel_mode_enum not null,
  distance_m       int,
  duration_seconds int,
  provider         text,
  computed_at      timestamptz not null default now(),
  primary key (from_place_id, to_place_id, mode)
);

alter table travel_estimates enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Guidance, media links, phrases, advisories
-- ══════════════════════════════════════════════════════════════════════════════

create table guidance_blocks (
  id              uuid primary key default gen_random_uuid(),
  guidance_type   guidance_type_enum not null,
  body_i18n       jsonb not null default '{}'::jsonb,
  applies_to_table text not null check (applies_to_table in ('destinations', 'places', 'experiences')),
  applies_to_id   uuid not null,
  sort_order      int not null default 0,
  status          publish_status_enum not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index guidance_blocks_target_idx on guidance_blocks (applies_to_table, applies_to_id)
  where deleted_at is null;

create trigger guidance_blocks_set_updated_at
  before update on guidance_blocks for each row execute function set_updated_at();
create trigger guidance_blocks_record_version
  after insert or update on guidance_blocks for each row execute function record_entity_version();
alter table guidance_blocks enable row level security;

create table entity_media (
  media_id     uuid not null references media_assets (id) on delete cascade,
  entity_table text not null,
  entity_id    uuid not null,
  role         text not null check (role in ('hero', 'gallery', 'map', 'audio')),
  sort_order   int not null default 0,
  primary key (media_id, entity_table, entity_id)
);

create index entity_media_entity_idx on entity_media (entity_table, entity_id, sort_order);

alter table entity_media enable row level security;

create table phrases (
  id              uuid primary key default gen_random_uuid(),
  destination_id  uuid references destinations (id) on delete cascade,
  context_tag     text not null check (context_tag in (
                    'directions', 'queue', 'facilities', 'medical', 'dietary', 'greeting', 'help'
                  )),
  source_locale   text not null references locales (code) on update cascade,
  source_text     text not null,
  translations    jsonb not null default '{}'::jsonb,
  audio_media_id  uuid references media_assets (id) on delete set null,
  sort_order      int not null default 0,
  status          publish_status_enum not null default 'draft',
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column phrases.destination_id is 'NULL = universal phrase, not destination-specific.';
comment on column phrases.translations is '{"te":{"text":"...","transliteration":"..."}}';

create index phrases_destination_idx on phrases (destination_id, context_tag, sort_order);

create trigger phrases_set_updated_at
  before update on phrases for each row execute function set_updated_at();
create trigger phrases_record_version
  after insert or update on phrases for each row execute function record_entity_version();
alter table phrases enable row level security;

create table advisories (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations (id) on delete cascade,
  title_i18n     jsonb not null default '{}'::jsonb,
  body_i18n      jsonb not null default '{}'::jsonb,
  severity       text not null default 'info' check (severity in ('info', 'caution', 'important')),
  starts_at      timestamptz,
  ends_at        timestamptz,
  source_id      uuid references sources (id) on delete set null,
  status         publish_status_enum not null default 'draft',
  published_at   timestamptz,
  published_by   uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint advisories_window_order check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  )
);

create index advisories_destination_idx on advisories (destination_id, severity);
create index advisories_window_idx on advisories (starts_at, ends_at);

create trigger advisories_set_updated_at
  before update on advisories for each row execute function set_updated_at();
create trigger advisories_record_version
  after insert or update on advisories for each row execute function record_entity_version();
alter table advisories enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Live feeds (config now, readings from M3 — DYN-* / B-031)
-- ══════════════════════════════════════════════════════════════════════════════

create table live_feed_configs (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations (id) on delete cascade,
  feed_kind      text not null check (feed_kind in ('weather', 'transport', 'closure', 'availability', 'road')),
  provider       text not null,
  config         jsonb not null default '{}'::jsonb,
  refresh_minutes int not null default 60,
  is_enabled     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index live_feed_configs_destination_idx on live_feed_configs (destination_id, feed_kind);

create trigger live_feed_configs_set_updated_at
  before update on live_feed_configs for each row execute function set_updated_at();
alter table live_feed_configs enable row level security;

create table live_feed_readings (
  id                 uuid primary key default gen_random_uuid(),
  feed_config_id     uuid not null references live_feed_configs (id) on delete cascade,
  read_at            timestamptz not null default now(),
  payload            jsonb not null default '{}'::jsonb,
  status             text not null check (status in ('ok', 'stale', 'unavailable')),
  affects_entity_ids uuid[] not null default '{}',
  created_at         timestamptz not null default now()
);

create index live_feed_readings_config_idx on live_feed_readings (feed_config_id, read_at desc);

alter table live_feed_readings enable row level security;
