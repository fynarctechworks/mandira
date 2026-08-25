-- 0002_locales_sources_trust.sql — TRD §4.2 locales + §4.3 sources & trust (TRD-DB-001/004).
--
-- This is the trust spine. Every knowledge fact added in B-004 hangs its provenance here,
-- and the publish gate (>= human_reviewed) reads verification_status from trust_records.
--
-- RLS is enabled on every table as it is created, so nothing is ever briefly world-readable.
-- Policies land in B-006; until then these tables are deny-by-default to anon/authenticated
-- and reachable only via the service role.

-- ══════════════════════════════════════════════════════════════════════════════
-- Shared plumbing
-- ══════════════════════════════════════════════════════════════════════════════

-- Keeps updated_at honest. Attached to every table that has the column.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE. Attach as a BEFORE UPDATE row trigger.';

/*
 * Reusable entity-version recorder (TRD §4.3 "Insert trigger on every knowledge table").
 * B-004 attaches this to each knowledge table rather than reimplementing it, so history
 * cannot drift between tables. Version numbers are per-entity and gap-free.
 *
 * changed_fields is empty on INSERT (the whole row is new) and lists only genuinely
 * changed top-level columns on UPDATE.
 */
create or replace function record_entity_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version int;
  changed text[];
  actor uuid;
begin
  begin
    actor := auth.uid();
  exception
    when others then
      actor := null;
  end;

  select coalesce(max(v.version), 0) + 1
    into next_version
    from entity_versions v
   where v.entity_table = tg_table_name
     and v.entity_id = new.id;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(o.key order by o.key), '{}')
      into changed
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n on n.key = o.key
     where o.value is distinct from n.value
       -- updated_at always changes; it is noise, not a content change.
       and o.key <> 'updated_at';
  else
    changed := '{}';
  end if;

  insert into entity_versions (entity_table, entity_id, version, snapshot, changed_fields, changed_by)
  values (tg_table_name, new.id, next_version, to_jsonb(new), changed, actor);

  return new;
end;
$$;

comment on function record_entity_version() is
  'Trigger function: appends a row to entity_versions on INSERT/UPDATE. Attach as AFTER INSERT OR UPDATE FOR EACH ROW.';

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.2 Locales & translation infrastructure
-- ══════════════════════════════════════════════════════════════════════════════

create table locales (
  code                    text primary key,
  name_native             text not null,
  name_en                 text not null,
  script                  text not null,
  transliteration_scheme  text,
  is_active               boolean not null default true,
  sort_order              int not null default 100,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table locales is 'TRD §4.2. Adding a locale = adding a row here plus ui_strings rows.';

create trigger locales_set_updated_at
  before update on locales
  for each row execute function set_updated_at();

alter table locales enable row level security;

-- next-intl JSON is generated from this table at build time; Ops edits rows here.
create table ui_strings (
  key         text not null,
  locale      text not null references locales (code) on update cascade on delete restrict,
  value       text not null,
  status      text not null default 'draft' check (status in ('draft', 'ai_draft', 'confirmed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (key, locale)
);

comment on table ui_strings is 'TRD §4.2. Source of truth for UI copy; next-intl JSON is built from it.';

create index ui_strings_locale_status_idx on ui_strings (locale, status);

create trigger ui_strings_set_updated_at
  before update on ui_strings
  for each row execute function set_updated_at();

alter table ui_strings enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.3 Sources
-- ══════════════════════════════════════════════════════════════════════════════

create table sources (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  source_type          text not null check (source_type in (
                         'official_authority', 'official_destination_org', 'government',
                         'licensed_provider', 'partner', 'structured_service',
                         'curated_research', 'user_report'
                       )),
  tier                 source_tier_enum not null,
  url                  text,
  contact              text,
  coverage             jsonb not null default '[]'::jsonb,
  refresh_cadence_days int,
  ingestion_method     text not null default 'manual'
                         check (ingestion_method in ('manual', 'url_monitor', 'api', 'file_upload')),
  owner_user_id        uuid references auth.users (id) on delete set null,
  status               text not null default 'active' check (status in ('active', 'paused', 'retired')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column sources.coverage is 'Array of destination ids this source covers (jsonb, TRD §4.3).';

create index sources_tier_status_idx on sources (tier, status);
create index sources_coverage_idx on sources using gin (coverage);

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();

alter table sources enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.3 Trust records — freshness and confidence are DERIVED, never hand-set
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * TRD §4.3 freshness rule: <= 90 d fresh, <= 180 d aging, else stale.
 * An expired valid_until forces stale regardless of age, and a never-verified record is
 * stale rather than fresh — absence of verification is not freshness.
 */
create or replace function derive_freshness(
  p_verified_at timestamptz,
  p_valid_until date
)
returns freshness_enum
language sql
immutable
as $$
  select case
    when p_valid_until is not null and p_valid_until < current_date then 'stale'::freshness_enum
    when p_verified_at is null then 'stale'::freshness_enum
    when p_verified_at >= now() - interval '90 days' then 'fresh'::freshness_enum
    when p_verified_at >= now() - interval '180 days' then 'aging'::freshness_enum
    else 'stale'::freshness_enum
  end;
$$;

/*
 * TRD §4.3 confidence rule:
 *   T1/T2 + verified + fresh                       -> high
 *   verified + aging, or T3 + verified + fresh     -> medium
 *   everything else                                -> low
 * A conflict flag or a report-driven downgrade caps confidence at low: PRD F9 requires the
 * "Check locally" badge in exactly those cases.
 */
create or replace function derive_confidence(
  p_tier source_tier_enum,
  p_verification_status verification_status_enum,
  p_freshness freshness_enum,
  p_conflict_flag boolean,
  p_report_downgrade boolean
)
returns confidence_enum
language sql
immutable
as $$
  select case
    when coalesce(p_conflict_flag, false) or coalesce(p_report_downgrade, false)
      then 'low'::confidence_enum
    when p_verification_status <> 'verified'
      then 'low'::confidence_enum
    when p_tier in ('T1', 'T2') and p_freshness = 'fresh'
      then 'high'::confidence_enum
    when p_freshness = 'aging' or (p_tier = 'T3' and p_freshness = 'fresh')
      then 'medium'::confidence_enum
    else 'low'::confidence_enum
  end;
$$;

create table trust_records (
  id                  uuid primary key default gen_random_uuid(),
  entity_table        text not null,
  entity_id           uuid not null,
  field_name          text,
  source_id           uuid references sources (id) on delete set null,
  source_tier         source_tier_enum,
  verification_status verification_status_enum not null default 'unverified',
  verified_at         timestamptz,
  verified_by         uuid references auth.users (id) on delete set null,
  valid_until         date,
  evidence_url        text,
  evidence_excerpt    text,
  freshness           freshness_enum not null default 'stale',
  confidence          confidence_enum not null default 'low',
  conflict_flag       boolean not null default false,
  report_downgrade    boolean not null default false,
  ai_generated        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- field_name IS NULL means whole-entity trust. Postgres treats NULLs as distinct by
  -- default, which would allow duplicate whole-entity rows — hence NULLS NOT DISTINCT.
  constraint trust_records_entity_field_key
    unique nulls not distinct (entity_table, entity_id, field_name)
);

comment on table trust_records is
  'TRD §4.3. field_name NULL = whole-entity trust. freshness/confidence are derived by trigger.';

create index trust_records_entity_idx on trust_records (entity_table, entity_id);
create index trust_records_source_idx on trust_records (source_id);
create index trust_records_attention_idx on trust_records (freshness, confidence)
  where conflict_flag or report_downgrade;

-- Derivation runs on write so a row is never persisted with stale derived values. The daily
-- pg_cron job (wired with the jobs work) re-runs it as time passes.
create or replace function apply_trust_derivations()
returns trigger
language plpgsql
as $$
begin
  new.freshness := derive_freshness(new.verified_at, new.valid_until);
  new.confidence := derive_confidence(
    new.source_tier, new.verification_status, new.freshness,
    new.conflict_flag, new.report_downgrade
  );
  return new;
end;
$$;

create trigger trust_records_apply_derivations
  before insert or update on trust_records
  for each row execute function apply_trust_derivations();

create trigger trust_records_set_updated_at
  before update on trust_records
  for each row execute function set_updated_at();

alter table trust_records enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.3 Ingestion pipeline — tables created now for schema completeness (TRD §11.2
-- Day 2); nothing reads or writes them until B-029 (M3).
-- ══════════════════════════════════════════════════════════════════════════════

create table ingestion_jobs (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references sources (id) on delete cascade,
  kind         text not null check (kind in ('scheduled', 'manual')),
  status       text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index ingestion_jobs_source_idx on ingestion_jobs (source_id, created_at desc);

create trigger ingestion_jobs_set_updated_at
  before update on ingestion_jobs
  for each row execute function set_updated_at();

alter table ingestion_jobs enable row level security;

create table source_captures (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references sources (id) on delete cascade,
  captured_at         timestamptz not null default now(),
  storage_path        text,
  content_hash        text,
  diff_from_previous  text,
  ingestion_job_id    uuid references ingestion_jobs (id) on delete set null,
  created_at          timestamptz not null default now()
);

comment on column source_captures.storage_path is 'Path in the private `captures` bucket.';

create index source_captures_source_idx on source_captures (source_id, captured_at desc);
create index source_captures_hash_idx on source_captures (content_hash);

alter table source_captures enable row level security;

create table ai_extractions (
  id                uuid primary key default gen_random_uuid(),
  capture_id        uuid not null references source_captures (id) on delete cascade,
  model             text not null,
  provider          text not null,
  proposed_entities jsonb not null default '[]'::jsonb,
  status            text not null default 'pending' check (status in ('pending', 'reviewed')),
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on column ai_extractions.proposed_entities is
  'Array of {entity_table, entity_id|null, fields:{name:{value, confidence, excerpt}}}. AI never writes knowledge tables directly (CLAUDE.md §5).';

create index ai_extractions_capture_idx on ai_extractions (capture_id);
create index ai_extractions_status_idx on ai_extractions (status) where status = 'pending';

alter table ai_extractions enable row level security;

create table change_candidates (
  id              uuid primary key default gen_random_uuid(),
  entity_table    text not null,
  entity_id       uuid,
  field_name      text,
  old_value       jsonb,
  new_value       jsonb,
  source_id       uuid references sources (id) on delete set null,
  capture_id      uuid references source_captures (id) on delete set null,
  excerpt         text,
  status          task_status_enum not null default 'open',
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz,
  decision_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index change_candidates_entity_idx on change_candidates (entity_table, entity_id);
create index change_candidates_open_idx on change_candidates (status) where status = 'open';

create trigger change_candidates_set_updated_at
  before update on change_candidates
  for each row execute function set_updated_at();

alter table change_candidates enable row level security;

create table conflicts (
  id                 uuid primary key default gen_random_uuid(),
  entity_table       text not null,
  entity_id          uuid not null,
  field_name         text,
  values             jsonb not null default '[]'::jsonb,
  status             text not null default 'open'
                       check (status in ('open', 'resolved_winner', 'resolved_both_valid', 'escalated')),
  winner_source_id   uuid references sources (id) on delete set null,
  resolution_reason  text,
  resolved_by        uuid references auth.users (id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column conflicts.values is
  'Array of {source_id, tier, value, captured_at} (TRD §4.3).';

create index conflicts_entity_idx on conflicts (entity_table, entity_id);
create index conflicts_open_idx on conflicts (status) where status = 'open';

create trigger conflicts_set_updated_at
  before update on conflicts
  for each row execute function set_updated_at();

alter table conflicts enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.3 History, audit, work queue
-- ══════════════════════════════════════════════════════════════════════════════

create table entity_versions (
  id             uuid primary key default gen_random_uuid(),
  entity_table   text not null,
  entity_id      uuid not null,
  version        int not null,
  snapshot       jsonb not null,
  changed_fields text[] not null default '{}',
  changed_by     uuid references auth.users (id) on delete set null,
  change_reason  text,
  created_at     timestamptz not null default now(),
  constraint entity_versions_entity_version_key unique (entity_table, entity_id, version)
);

comment on table entity_versions is
  'TRD §4.3. Written by record_entity_version() on every knowledge table. Append-only.';

create index entity_versions_entity_idx on entity_versions (entity_table, entity_id, version desc);

alter table entity_versions enable row level security;

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  entity_table  text,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  ip_hash       text,
  created_at    timestamptz not null default now()
);

comment on column audit_log.ip_hash is 'Hashed, never the raw IP (PRD §10 privacy).';

create index audit_log_entity_idx on audit_log (entity_table, entity_id, created_at desc);
create index audit_log_actor_idx on audit_log (actor_user_id, created_at desc);

alter table audit_log enable row level security;

create table review_tasks (
  id           uuid primary key default gen_random_uuid(),
  task_type    review_task_type_enum not null,
  entity_table text,
  entity_id    uuid,
  field_name   text,
  related_id   uuid,
  status       task_status_enum not null default 'open',
  assigned_to  uuid references auth.users (id) on delete set null,
  priority     int not null default 3,
  due_at       timestamptz,
  notes        text,
  completed_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column review_tasks.related_id is
  'change_candidate / conflict / report / extraction id, depending on task_type.';

create index review_tasks_queue_idx on review_tasks (task_type, status, priority, created_at);
create index review_tasks_assignee_idx on review_tasks (assigned_to, status)
  where status in ('open', 'in_progress');

create trigger review_tasks_set_updated_at
  before update on review_tasks
  for each row execute function set_updated_at();

alter table review_tasks enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Launch locales (D-014). Content for te/hi lands in M4; the rows exist from M0 so
-- strings are externalised from the start.
-- ══════════════════════════════════════════════════════════════════════════════

insert into locales (code, name_native, name_en, script, transliteration_scheme, is_active, sort_order)
values
  ('en', 'English', 'English', 'Latn', null, true, 1),
  ('te', 'తెలుగు', 'Telugu', 'Telu', 'itrans', true, 2),
  ('hi', 'हिन्दी', 'Hindi', 'Deva', 'itrans', true, 3)
on conflict (code) do nothing;
