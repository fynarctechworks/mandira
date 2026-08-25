-- 0005_journeys.sql — TRD §4.6 journeys.
--
-- The engine (packages/journey-engine) reads a KnowledgeBundle and a journey, and writes
-- planned_* times plus health back here. Nothing in this schema applies a change on its
-- own: journey_change_events records what was OFFERED and what the user CHOSE, which is
-- how PRD Principle 6 ("no state-changing action without an explicit tap") stays auditable.

create table journeys (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid references auth.users (id) on delete cascade,
  device_draft_id       text,
  title                 text,
  status                journey_status_enum not null default 'draft',
  start_date            date,
  end_date              date,
  timezone              text not null default 'Asia/Kolkata',
  day_start_time        time not null default '06:00',
  day_end_time          time not null default '21:00',
  pace                  pace_enum not null default 'balanced',
  structure             text not null default 'structured'
                          check (structure in ('structured', 'flexible')),
  walking_tolerance     text check (walking_tolerance in ('low', 'medium', 'high')),
  transport_preference  text check (transport_preference in (
                          'own_vehicle', 'public', 'hired', 'walk_where_possible'
                        )),
  brief                 jsonb,
  health_state          health_state_enum,
  health_report         jsonb,
  knowledge_snapshot_at timestamptz,
  active_day_index      int,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  -- A journey belongs to a signed-in user or to a guest device draft, never neither:
  -- guest drafts (PRD PLAN-*) are claimed by owner_user_id on sign-in.
  constraint journeys_owner_or_device check (
    owner_user_id is not null or device_draft_id is not null
  ),
  constraint journeys_date_order check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

comment on column journeys.device_draft_id is
  'Guest draft identifier; the draft is claimed by owner_user_id at sign-in (TRD §4.6).';
comment on column journeys.brief is 'Confirmed Journey Brief from PRD F3.';
comment on column journeys.health_report is 'Last engine output (causes, per-day states).';

create index journeys_owner_idx on journeys (owner_user_id, status) where deleted_at is null;
create index journeys_device_draft_idx on journeys (device_draft_id) where device_draft_id is not null;

create trigger journeys_set_updated_at
  before update on journeys for each row execute function set_updated_at();
alter table journeys enable row level security;

create table journey_destinations (
  journey_id     uuid not null references journeys (id) on delete cascade,
  destination_id uuid not null references destinations (id) on delete restrict,
  sort_order     int not null default 0,
  primary key (journey_id, destination_id)
);

alter table journey_destinations enable row level security;

create table journey_travelers (
  journey_id          uuid not null references journeys (id) on delete cascade,
  traveler_profile_id uuid not null references traveler_profiles (id) on delete cascade,
  primary key (journey_id, traveler_profile_id)
);

alter table journey_travelers enable row level security;

create table journey_items (
  id                      uuid primary key default gen_random_uuid(),
  journey_id              uuid not null references journeys (id) on delete cascade,
  day_index               int not null default 0,
  sort_order              int not null default 0,
  item_type               journey_item_type_enum not null,
  tier                    priority_tier_enum not null default 'important',
  title_override          text,
  experience_id           uuid references experiences (id) on delete set null,
  place_id                uuid references places (id) on delete set null,
  route_id                uuid references routes (id) on delete set null,
  transport_connection_id uuid references transport_connections (id) on delete set null,
  fixed_start_at          timestamptz,
  fixed_end_at            timestamptz,
  preferred_window_start  time,
  preferred_window_end    time,
  planned_start_at        timestamptz,
  planned_end_at          timestamptz,
  duration_likely_minutes int,
  duration_max_minutes    int,
  travel_mode             travel_mode_enum,
  travel_from_item_id     uuid references journey_items (id) on delete set null,
  buffer_minutes          int not null default 15,
  note                    text,
  prep_requirements       jsonb,
  status                  text not null default 'planned'
                            check (status in ('planned', 'in_progress', 'done', 'skipped', 'moved')),
  actual_start_at         timestamptz,
  actual_end_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  -- TRD §4.6: fixed_start_at is required when tier = fixed. This is the return guard's
  -- anchor (PRD-PLAN-006) — a FIXED item without a time cannot be honoured.
  constraint journey_items_fixed_requires_start check (
    tier <> 'fixed' or fixed_start_at is not null
  ),
  constraint journey_items_fixed_time_order check (
    fixed_start_at is null or fixed_end_at is null or fixed_start_at <= fixed_end_at
  ),
  constraint journey_items_day_index_non_negative check (day_index >= 0),
  constraint journey_items_no_self_travel check (travel_from_item_id <> id)
);

comment on column journey_items.prep_requirements is
  'Copied from knowledge at add time so a later knowledge edit cannot silently rewrite an existing plan (TRD §4.6).';
comment on column journey_items.day_index is '0-based.';

create index journey_items_journey_day_idx on journey_items (journey_id, day_index, sort_order)
  where deleted_at is null;
create index journey_items_experience_idx on journey_items (experience_id);

create trigger journey_items_set_updated_at
  before update on journey_items for each row execute function set_updated_at();
alter table journey_items enable row level security;

create table journey_item_dependencies (
  item_id       uuid not null references journey_items (id) on delete cascade,
  after_item_id uuid not null references journey_items (id) on delete cascade,
  primary key (item_id, after_item_id),
  constraint journey_item_dependencies_not_self check (item_id <> after_item_id)
);

alter table journey_item_dependencies enable row level security;

/*
 * The replanning audit trail (PRD F6). One row per trigger that produced a Change Card.
 * chosen_option_index NULL means the user kept their plan as is or dismissed the card —
 * that is a real outcome worth recording, not a missing value.
 */
create table journey_change_events (
  id                  uuid primary key default gen_random_uuid(),
  journey_id          uuid not null references journeys (id) on delete cascade,
  trigger             change_trigger_enum not null,
  trigger_payload     jsonb,
  impact              jsonb,
  change_card         jsonb,
  chosen_option_index int,
  applied_changes     jsonb,
  created_at          timestamptz not null default now(),
  decided_at          timestamptz
);

comment on column journey_change_events.chosen_option_index is
  'NULL = kept as is / dismissed (PRD F6).';

create index journey_change_events_journey_idx on journey_change_events (journey_id, created_at desc);

alter table journey_change_events enable row level security;

create table prepare_tasks (
  id             uuid primary key default gen_random_uuid(),
  journey_id     uuid not null references journeys (id) on delete cascade,
  group_name     text not null check (group_name in (
                   'bookings', 'documents', 'carry', 'know', 'travelers', 'downloads'
                 )),
  title_i18n     jsonb not null default '{}'::jsonb,
  body_i18n      jsonb not null default '{}'::jsonb,
  source_item_id uuid references journey_items (id) on delete cascade,
  trust_ref      jsonb,
  due_at         timestamptz,
  is_done        boolean not null default false,
  done_at        timestamptz,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index prepare_tasks_journey_idx on prepare_tasks (journey_id, group_name, sort_order);
create index prepare_tasks_due_idx on prepare_tasks (due_at) where not is_done;

create trigger prepare_tasks_set_updated_at
  before update on prepare_tasks for each row execute function set_updated_at();
alter table prepare_tasks enable row level security;

create table journey_records (
  id                 uuid primary key default gen_random_uuid(),
  journey_id         uuid not null unique references journeys (id) on delete cascade,
  summary            jsonb,
  reflection_answers jsonb,
  created_at         timestamptz not null default now()
);

comment on column journey_records.reflection_answers is
  '{"most_meaningful":"","do_differently":"","got_wrong":""} (TRD §4.6).';

alter table journey_records enable row level security;

create table journey_item_notes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references journey_items (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text,
  media_id   uuid references media_assets (id) on delete set null,
  created_at timestamptz not null default now()
);

create index journey_item_notes_item_idx on journey_item_notes (item_id, created_at);

alter table journey_item_notes enable row level security;

-- Read-only share links (PRD SHARE-01, TRD-SEC-004). Tokens expire; expiry is enforced
-- in the route handler and re-checked by RLS in B-006.
create table journey_shares (
  id         uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys (id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index journey_shares_journey_idx on journey_shares (journey_id);

alter table journey_shares enable row level security;
