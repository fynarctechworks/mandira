-- 0004_users.sql — TRD §4.5 users, roles, personalization.
--
-- PRIVACY NOTE (PRD §10, PRD-PRIV-002, CLAUDE.md §5): `traveler_profiles` holds mobility
-- and age band. Those attributes are never exposed to Ops, analytics, exports or
-- targeting — they exist solely so the engine can size buffers and physical load. They
-- are deliberately kept in their own table (rather than as columns on profiles) so that
-- "never join this into an Ops view" is a rule about one table, not scattered columns.

create table profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text,
  locale               text not null default 'en' references locales (code) on update cascade,
  timezone             text not null default 'Asia/Kolkata',
  notification_prefs   jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

comment on column profiles.notification_prefs is
  'Keys are notification_type_enum values, values boolean (TRD §4.5).';

create trigger profiles_set_updated_at
  before update on profiles for each row execute function set_updated_at();
alter table profiles enable row level security;

-- Ops roles. A user with no row here is a plain traveler; the Ops app gates on this
-- table at the root layout (B-007) and RLS re-checks it server-side (B-006).
create table user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       ops_role_enum not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on user_roles (role);

alter table user_roles enable row level security;

create table traveler_profiles (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  label         text,
  mobility      mobility_enum not null default 'full',
  age_band      age_band_enum not null default 'adult',
  dietary_tags  text[] not null default '{}',
  locale        text references locales (code) on update cascade,
  is_self       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table traveler_profiles is
  'SENSITIVE (PRD-PRIV-002). Owner-only via RLS. Never joined into Ops views, exports or analytics.';

create index traveler_profiles_owner_idx on traveler_profiles (owner_user_id)
  where deleted_at is null;

create trigger traveler_profiles_set_updated_at
  before update on traveler_profiles for each row execute function set_updated_at();
alter table traveler_profiles enable row level security;

create table saved_places (
  user_id    uuid not null references auth.users (id) on delete cascade,
  place_id   uuid not null references places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table saved_places enable row level security;

/*
 * Behavioural signals feeding personalization ranking (PERS-*, M4).
 * Deliberately records what the user DID (set a tier, kept an item), never inferred
 * spiritual importance — PRD Principle 1 forbids the system inferring that.
 */
create table personalization_signals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  signal_type  text not null check (signal_type in (
                 'tier_set', 'preference_set', 'item_kept',
                 'item_removed', 'pace_changed', 'experience_completed'
               )),
  entity_table text,
  entity_id    uuid,
  value        jsonb,
  journey_id   uuid,
  created_at   timestamptz not null default now()
);

create index personalization_signals_user_idx on personalization_signals (user_id, created_at desc);

alter table personalization_signals enable row level security;
