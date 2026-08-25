-- 0006_reports_notifications.sql — TRD §4.7 reports, notifications, analytics.

/*
 * Traveler-submitted corrections (PRD F14). Ops sees `reporter_hash`, never the user id:
 * the column exists so operators can spot "three reports from the same person" without
 * learning who that person is (PRD §10 privacy).
 *
 * Three independent reports on the same field within 14 days auto-set the field's badge
 * to "Check locally" (PRD F14) — that rule is implemented alongside the report workflow
 * in B-028; the trust_records.report_downgrade flag it drives already exists (0002).
 */
create table user_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  reporter_hash     text,
  report_type       report_type_enum not null,
  entity_table      text not null,
  entity_id         uuid not null,
  field_name        text,
  description       text check (description is null or length(description) <= 500),
  media_id          uuid references media_assets (id) on delete set null,
  journey_id        uuid references journeys (id) on delete set null,
  locale            text references locales (code) on update cascade,
  client_created_at timestamptz,
  status            report_status_enum not null default 'new',
  resolution_note   text,
  resolved_by       uuid references auth.users (id) on delete set null,
  resolved_at       timestamptz,
  notified_user     boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column user_reports.reporter_hash is
  'Pseudonymised reporter identity for Ops. Ops never sees user_id (PRD §10).';
comment on column user_reports.media_id is 'Photo lands in the private `reports` bucket (M4, D-016).';

create index user_reports_entity_idx on user_reports (entity_table, entity_id, field_name);
create index user_reports_queue_idx on user_reports (status, created_at)
  where status not in ('closed', 'resolved_updated', 'resolved_confirmed_correct', 'resolved_unverifiable');
create index user_reports_user_idx on user_reports (user_id, created_at desc);

create trigger user_reports_set_updated_at
  before update on user_reports for each row execute function set_updated_at();
alter table user_reports enable row level security;

-- Web Push (VAPID) endpoints. failure_count drives pruning of dead endpoints.
create table notification_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  keys            jsonb not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   int not null default 0
);

comment on column notification_subscriptions.keys is '{p256dh, auth}';

create index notification_subscriptions_user_idx on notification_subscriptions (user_id);

alter table notification_subscriptions enable row level security;

create table notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  notification_type notification_type_enum not null,
  title_i18n        jsonb not null default '{}'::jsonb,
  body_i18n         jsonb not null default '{}'::jsonb,
  journey_id        uuid references journeys (id) on delete cascade,
  payload           jsonb,
  scheduled_for     timestamptz,
  sent_at           timestamptz,
  read_at           timestamptz,
  channel           text not null check (channel in ('push', 'inapp', 'email')),
  status            text not null default 'scheduled'
                      check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column notifications.payload is 'Deep link, change_event_id, etc. (TRD §4.7).';

create index notifications_user_idx on notifications (user_id, created_at desc);
-- The sender scans this: due, not yet sent.
create index notifications_due_idx on notifications (scheduled_for)
  where status = 'scheduled';

create trigger notifications_set_updated_at
  before update on notifications for each row execute function set_updated_at();
alter table notifications enable row level security;

/*
 * Product analytics (PRD-ANLY-001). Deliberately has NO user_id column — not a nullable
 * one, none at all, so there is nothing to accidentally populate. Identity here is an
 * anonymous rotating session id, and `properties` is restricted to an allowlist enforced
 * in application code (B-024).
 */
create table analytics_events (
  id              uuid primary key default gen_random_uuid(),
  event_name      text not null,
  anon_session_id text,
  journey_id      uuid,
  destination_id  uuid,
  properties      jsonb not null default '{}'::jsonb,
  locale          text,
  is_offline      boolean not null default false,
  created_at      timestamptz not null default now()
);

comment on table analytics_events is
  'No PII, and no user_id column by design (PRD §10, PRD-ANLY-001).';

create index analytics_events_name_idx on analytics_events (event_name, created_at desc);
create index analytics_events_destination_idx on analytics_events (destination_id, created_at desc);

alter table analytics_events enable row level security;

create table feature_flags (
  key             text primary key,
  is_enabled      boolean not null default false,
  destination_ids uuid[],
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column feature_flags.destination_ids is
  'NULL = applies everywhere; otherwise scoped to these destinations.';

create trigger feature_flags_set_updated_at
  before update on feature_flags for each row execute function set_updated_at();
alter table feature_flags enable row level security;
