-- 0029_security_hardening.sql — close the authorization gaps found by the 2026-09-12 audit.
--
-- Every change here answers a finding in docs/PROJECT_AUDIT.md §7.1, and every one is pinned
-- by supabase/tests/0030_security_hardening_test.sql, written so each assertion fails on the
-- schema as it stood before this file.
--
--   S-1  A client role could set status = 'published' directly through PostgREST, skipping
--        validation, separation of duties, the audit record and knowledge_updates.
--   S-2  anon could enumerate draft entity ids through entity_media, then read their trust,
--        accessibility notes, route stops and images through SECURITY DEFINER helpers.
--   S-3  audit_log had two write sites; no Ops mutation outside publishing was recorded.
--   S-4  record_audit() and validate_for_publish() were callable by any signed-in traveler.
--   S-5  service_role held full DML on traveler_profiles.
--   S-6  v_published_live_conditions ignored publish status and exposed affects_entity_ids.
--   S-9  knowledge_updates.published_by named Ops staff to every traveler.
--   S-10 publish_entity() ran with an unpinned search_path.
--
-- Additive in effect: no table or column is dropped. One view is recreated without a column
-- no reader selects (verified: apps/web/lib/live-conditions.ts lists its columns explicitly).

-- ══════════════════════════════════════════════════════════════════════════════
-- Who is asking
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * True when the current request comes from a browser-held identity (anon or authenticated).
 *
 * Two signals, either sufficient. PostgREST stamps `request.jwt.claims` from a verified JWT,
 * and switches `role`. The `role` setting is untouched by SECURITY DEFINER entry (only the
 * effective user id changes), so it still reads `authenticated` inside a definer helper
 * called from a view — which is exactly where this is needed. Server identities (postgres,
 * service_role, pg_cron) read false and keep full access.
 */
create or replace function request_is_client()
returns boolean
language sql
stable
parallel safe
set search_path = public
as $$
  select coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
      or coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) in ('anon', 'authenticated');
$$;

comment on function request_is_client() is
  'True for anon/authenticated requests. Server identities read false. See 0029 S-2.';

/*
 * Whether an entity is live for travelers. Static branches rather than dynamic SQL so each
 * lookup is a planned primary-key probe — this runs once per row of every published view.
 */
create or replace function entity_is_published(p_entity_table text, p_entity_id uuid)
returns boolean
language plpgsql
stable
parallel safe
security definer
set search_path = public
as $$
begin
  case p_entity_table
    when 'destinations' then
      return exists (select 1 from destinations
                      where id = p_entity_id and status = 'published' and deleted_at is null);
    when 'places' then
      return exists (select 1 from places
                      where id = p_entity_id and status = 'published' and deleted_at is null);
    when 'routes' then
      return exists (select 1 from routes
                      where id = p_entity_id and status = 'published' and deleted_at is null);
    when 'experiences' then
      return exists (select 1 from experiences
                      where id = p_entity_id and status = 'published' and deleted_at is null);
    when 'guidance_blocks' then
      return exists (select 1 from guidance_blocks
                      where id = p_entity_id and status = 'published' and deleted_at is null);
    when 'circuits' then
      return exists (select 1 from circuits where id = p_entity_id and status = 'published');
    when 'transport_connections' then
      return exists (select 1 from transport_connections
                      where id = p_entity_id and status = 'published');
    when 'phrases' then
      return exists (select 1 from phrases where id = p_entity_id and status = 'published');
    when 'advisories' then
      return exists (select 1 from advisories where id = p_entity_id and status = 'published');
    when 'availability_rules' then
      return exists (
        select 1 from availability_rules a
          join experiences e on e.id = a.experience_id
         where a.id = p_entity_id and e.status = 'published' and e.deleted_at is null);
    else
      return false;
  end case;
end;
$$;

comment on function entity_is_published(text, uuid) is
  'Whether an entity is visible to travelers. Unknown tables read false (fail closed).';

revoke all on function request_is_client() from public;
revoke all on function entity_is_published(text, uuid) from public;
grant execute on function request_is_client() to anon, authenticated, service_role;
grant execute on function entity_is_published(text, uuid) to anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-1 · Only publish_entity() may make something published
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Refuses a client-role write that makes a row published, or that edits published_at.
 *
 * Enforced on the ROLE running the statement. publish_entity() is SECURITY DEFINER (below),
 * so its UPDATE runs as the owner and passes; a PATCH through PostgREST runs as
 * `authenticated` and is refused. Seeds, tests and jobs run as server identities and are
 * unaffected. Editing a row that is already published, and unpublishing, stay allowed —
 * both are ordinary editorial work, and both are now audited (S-3).
 */
create or replace function guard_publish_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    raise exception 'Publishing goes through publish_entity(), which validates and records it'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) -> 'published_at') is distinct from (to_jsonb(old) -> 'published_at') then
    raise exception 'published_at is set by publish_entity() only'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function guard_publish_status() is
  'S-1: client roles cannot set status=published or published_at. publish_entity() can.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'destinations', 'circuits', 'places', 'routes', 'experiences',
    'transport_connections', 'guidance_blocks', 'phrases', 'advisories'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_guard_publish', t);
    execute format(
      'create trigger %I before insert or update on %I '
      'for each row execute function guard_publish_status()',
      t || '_guard_publish', t
    );
  end loop;
end;
$$;

/*
 * publish_entity, now SECURITY DEFINER with a pinned search_path (S-1, S-10).
 *
 * Body identical to 0026. Running as the owner is what lets its UPDATE pass the guard above
 * while nothing else can. It gives up nothing: the approver role check, validation and
 * separation of duties are all explicit statements below, and auth.uid() still reads the
 * caller from the JWT, so versions and the audit record name the real approver.
 */
create or replace function publish_entity(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  problems jsonb;
  last_editor uuid;
  actor uuid := (select auth.uid());
  v_destination uuid;
  v_fields jsonb := '[]'::jsonb;
begin
  if p_entity_table not in ('destinations', 'places', 'experiences', 'routes',
                            'transport_connections', 'guidance_blocks', 'phrases', 'advisories') then
    raise exception 'Cannot publish %', p_entity_table using errcode = 'check_violation';
  end if;

  if not has_any_role('approver', 'admin') then
    raise exception 'Publishing needs the approver role' using errcode = 'insufficient_privilege';
  end if;

  problems := validate_for_publish(p_entity_table, p_entity_id);
  if jsonb_array_length(problems) > 0 then
    raise exception 'Not ready to publish: %', problems::text using errcode = 'check_violation';
  end if;

  select v.changed_by into last_editor
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id and v.changed_by is not null
   order by v.version desc
   limit 1;

  if last_editor is not null and last_editor = actor then
    raise exception 'Separation of duties: you last changed this, so someone else must approve it'
      using errcode = 'check_violation';
  end if;

  execute format(
    'update %I set status = ''published'', published_at = now() where id = $1',
    p_entity_table
  ) using p_entity_id;

  perform record_audit('publish', p_entity_table, p_entity_id, null,
                       jsonb_build_object('status', 'published'));

  if p_entity_table = 'destinations' then
    v_destination := p_entity_id;
  elsif p_entity_table <> 'guidance_blocks' then
    execute format('select destination_id from %I where id = $1', p_entity_table)
      into v_destination using p_entity_id;
  end if;

  select coalesce(to_jsonb(v.changed_fields), '[]'::jsonb) into v_fields
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id
   order by v.version desc
   limit 1;

  perform record_knowledge_update(p_entity_table, p_entity_id, v_destination, v_fields);

  return jsonb_build_object('published', true);
end;
$$;

comment on function publish_entity(text, uuid) is
  'The only path to published status (enforced by guard_publish_status, 0029). Validates, '
  'enforces separation of duties, audits, and records knowledge_updates.';

revoke all on function publish_entity(text, uuid) from public;
grant execute on function publish_entity(text, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-4 · Audit writer and publish validation are not for travelers
-- ══════════════════════════════════════════════════════════════════════════════

-- publish_entity() is the only caller and now runs as the owner, so no client needs this.
revoke all on function record_audit(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

/*
 * validate_for_publish becomes an Ops-only front door over the unchanged rules.
 *
 * Renamed rather than rewritten: the rule body in 0011 is long, reviewed and tested, and a
 * copy is a second place for it to drift. publish_entity() calls the front door by name and
 * passes the check as the approver it already verified.
 */
alter function validate_for_publish(text, uuid) rename to validate_for_publish_rules;
revoke all on function validate_for_publish_rules(text, uuid) from public, anon, authenticated;

create or replace function validate_for_publish(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if request_is_client() and not is_ops() then
    raise exception 'Only Ops can check whether something is ready to publish'
      using errcode = 'insufficient_privilege';
  end if;
  return validate_for_publish_rules(p_entity_table, p_entity_id);
end;
$$;

comment on function validate_for_publish(text, uuid) is
  'PRD F18 pre-publish validation, Ops-only (0029 S-4). [] when publishable, else [{field,message}].';

revoke all on function validate_for_publish(text, uuid) from public;
grant execute on function validate_for_publish(text, uuid) to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-2 · Definer helpers answer only for published entities
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function entity_trust(p_entity_table text, p_entity_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select case
    when request_is_client()
         and not entity_is_published(p_entity_table, p_entity_id)
         and not is_ops()
      then '{}'::jsonb
    else (
      select coalesce(
        jsonb_object_agg(
          coalesce(t.field_name, 'entity'),
          jsonb_build_object(
            'confidence', t.confidence,
            'freshness', t.freshness,
            'verified_at', t.verified_at,
            'valid_until', t.valid_until,
            'source_name', s.name,
            'source_tier_label', source_tier_label(t.source_tier),
            'conflict_flag', t.conflict_flag
          )
        ),
        '{}'::jsonb
      )
      from trust_records t
      left join sources s on s.id = t.source_id
      where t.entity_table = p_entity_table
        and t.entity_id = p_entity_id
    )
  end;
$$;

comment on function entity_trust(text, uuid) is
  'Trust metadata for one entity, keyed by field. Clients get {} for anything unpublished (0029 S-2).';

create or replace function accessibility_for(p_place_id uuid, p_route_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select case
    when request_is_client()
         and not (
           case when p_place_id is not null
                then entity_is_published('places', p_place_id)
                else entity_is_published('routes', p_route_id)
           end)
         and not is_ops()
      then null
    else (
      select jsonb_build_object(
        'step_free', a.step_free,
        'wheelchair_access', a.wheelchair_access,
        'queue_assistance', a.queue_assistance,
        'rest_seating', a.rest_seating,
        'distance_from_dropoff_m', a.distance_from_dropoff_m,
        'notes_i18n', a.notes_i18n
      )
      from accessibility_records a
      where (p_place_id is not null and a.place_id = p_place_id)
         or (p_route_id is not null and a.route_id = p_route_id)
      limit 1
    )
  end;
$$;

comment on function accessibility_for(uuid, uuid) is
  'One entity''s accessibility, or NULL. Clients get NULL for anything unpublished (0029 S-2).';

create or replace function route_stops_for(p_route_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select case
    when request_is_client() and not entity_is_published('routes', p_route_id) and not is_ops()
      then '[]'::jsonb
    else (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'place_id', p.id,
            'name_i18n', p.name_i18n,
            'sort_order', rp.sort_order,
            'is_rest_point', rp.is_rest_point
          )
          order by rp.sort_order
        ),
        '[]'::jsonb
      )
      from route_places rp
      join v_published_places p on p.id = rp.place_id
      where rp.route_id = p_route_id
    )
  end;
$$;

comment on function route_stops_for(uuid) is
  'Published stops of a published route, in order. Clients get [] for a draft route (0029 S-2).';

-- The join table and the image rows follow the entity they belong to.
drop policy if exists entity_media_public_read on entity_media;
create policy entity_media_public_read on entity_media
  for select to anon, authenticated
  using (is_ops() or entity_is_published(entity_table, entity_id));

drop policy if exists media_assets_public_read on media_assets;
create policy media_assets_public_read on media_assets
  for select to anon, authenticated
  using (
    deleted_at is null
    and (
      is_ops()
      or exists (
        select 1 from entity_media em
         where em.media_id = media_assets.id
           and entity_is_published(em.entity_table, em.entity_id)
      )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- S-3 · Every Ops mutation is audited, with a daily-salted ip_hash
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * One salt per day, never readable by any client and pruned as the day turns, so an
 * ip_hash can link actions within a day (abuse investigation) but never across days, and
 * never back to an address once the salt is gone (TRD §6.1, DPDP data minimisation).
 */
create table if not exists audit_ip_salts (
  day  date primary key,
  salt text not null
);

alter table audit_ip_salts enable row level security;
revoke all on audit_ip_salts from public, anon, authenticated, service_role;

create or replace function audit_ip_hash()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  ip text;
  today_salt text;
begin
  ip := btrim(split_part(coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''), ',', 1));
  if ip = '' then
    return null;
  end if;

  insert into audit_ip_salts (day, salt)
  values (current_date, gen_random_uuid()::text || gen_random_uuid()::text)
  on conflict (day) do nothing;

  delete from audit_ip_salts where day < current_date;

  select salt into today_salt from audit_ip_salts where day = current_date;
  return encode(sha256(convert_to(today_salt || '|' || ip, 'UTF8')), 'hex');
end;
$$;

revoke all on function audit_ip_hash() from public, anon, authenticated;

/*
 * Records an Ops user's INSERT / UPDATE / DELETE into audit_log.
 *
 * Only Ops actors: a traveler filing a report or a cron job writing a reading is not an
 * "Ops mutation" (TRD §6.1), and recording them would bury the trail in noise and put
 * traveler identities where Ops can read them. TG_ARGV[0] = 'lite' records the action
 * without row bodies, for tables whose payloads are large captures rather than decisions.
 */
create or replace function audit_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := to_jsonb(coalesce(new, old));
  entity_text text;
  lite boolean := tg_nargs > 0 and tg_argv[0] = 'lite';
begin
  if not is_ops() then
    return null;
  end if;

  entity_text := coalesce(
    row_json ->> 'id', row_json ->> 'media_id', row_json ->> 'route_id',
    row_json ->> 'circuit_id', row_json ->> 'destination_id', row_json ->> 'from_place_id',
    row_json ->> 'user_id'
  );

  insert into audit_log (actor_user_id, action, entity_table, entity_id, before, after, ip_hash)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    case when entity_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then entity_text::uuid end,
    case when tg_op in ('UPDATE', 'DELETE') and not lite then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') and not lite then to_jsonb(new) end,
    audit_ip_hash()
  );

  return null;
end;
$$;

comment on function audit_ops_change() is
  'S-3: AFTER row trigger writing audit_log for every Ops-actor mutation. Arg ''lite'' omits bodies.';

revoke all on function audit_ops_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    -- knowledge
    'destinations', 'circuits', 'circuit_destinations', 'destination_links', 'places',
    'routes', 'route_places', 'accessibility_records', 'experiences', 'availability_rules',
    'transport_connections', 'travel_estimates', 'guidance_blocks', 'phrases', 'advisories',
    'live_feed_configs', 'entity_media', 'media_assets',
    -- trust and pipeline
    'sources', 'trust_records', 'ingestion_jobs', 'change_candidates', 'conflicts',
    'review_tasks',
    -- administration
    'user_roles', 'feature_flags', 'locales', 'ui_strings', 'user_reports'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I '
      'for each row execute function audit_ops_change()',
      t || '_audit', t
    );
  end loop;

  foreach t in array array['source_captures', 'ai_extractions'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I '
      'for each row execute function audit_ops_change(''lite'')',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- Version history on the two id-keyed tables TRD §4.3 covers that 0003 missed.
drop trigger if exists media_assets_record_version on media_assets;
create trigger media_assets_record_version
  after insert or update on media_assets
  for each row execute function record_entity_version();

drop trigger if exists live_feed_configs_record_version on live_feed_configs;
create trigger live_feed_configs_record_version
  after insert or update on live_feed_configs
  for each row execute function record_entity_version();

create index if not exists audit_log_entity_idx on audit_log (entity_table, entity_id, created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_user_id, created_at desc);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- S-5 · The backend identity does not hold traveler profiles
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 0025 granted service_role every table in a loop. No server path reads traveler_profiles
-- as service_role (verified: every reader in apps/web uses the traveler's own session), and
-- account purging runs in pg_cron as the owner. Removing the grant makes CLAUDE.md §5's
-- boundary hold for the one identity RLS does not bind.

revoke all on table traveler_profiles from service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-6 · Live conditions only for published destinations, without entity ids
-- ══════════════════════════════════════════════════════════════════════════════

drop view if exists v_published_live_conditions;

create view v_published_live_conditions as
select distinct on (c.id)
  c.id            as feed_config_id,
  c.destination_id,
  c.feed_kind,
  c.provider,
  c.refresh_minutes,
  r.id            as reading_id,
  r.read_at,
  r.status,
  r.payload,
  (r.read_at < now() - make_interval(mins => c.refresh_minutes * 2)) as is_stale
from live_feed_configs c
join live_feed_readings r on r.feed_config_id = c.id
join destinations d on d.id = c.destination_id
where c.is_enabled
  and d.status = 'published'
  and d.deleted_at is null
order by c.id, r.read_at desc;

comment on view v_published_live_conditions is
  'Newest reading per enabled feed of a PUBLISHED destination, provider and timestamp always '
  'present (PRD F10). affects_entity_ids withheld (0029 S-6).';

revoke all on v_published_live_conditions from public;
grant select on v_published_live_conditions to anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-9 · Travelers learn what changed, not who changed it
-- ══════════════════════════════════════════════════════════════════════════════

revoke select on knowledge_updates from authenticated;
grant select (id, entity_table, entity_id, destination_id, changed_fields, published_at)
  on knowledge_updates to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- S-10 · No role but the owner creates objects in public
-- ══════════════════════════════════════════════════════════════════════════════

revoke create on schema public from public;
