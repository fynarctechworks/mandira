-- 0032_ops_admin_surfaces.sql — what the Ops administration screens need from the database.
--
--   O13  one publish implementation, shared by a person and by a schedule; scheduled publishing
--   O20  restoring an earlier version of an entity, back through review
--   O21  the Ops team with their roles, and finding an account to grant a role to
--   O01  knowledge-health figures in one call
--   O22  product signals, aggregated — never event rows
--
-- Every function checks its caller's role itself; none is granted to anon.

-- ══════════════════════════════════════════════════════════════════════════════
-- O13 · Publishing, for whoever is accountable for it
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * The publish rules with the accountable approver passed in.
 *
 * `publish_entity` passes the signed-in approver; the scheduler passes whoever scheduled it.
 * One body, so a scheduled publish meets exactly the validation, separation of duties, audit
 * record and knowledge_updates announcement that an immediate one does. Not granted to any
 * client role: a caller who could name the actor could publish as somebody else.
 */
create or replace function publish_entity_as(p_entity_table text, p_entity_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  problems jsonb;
  last_editor uuid;
  v_destination uuid;
  v_fields jsonb := '[]'::jsonb;
begin
  if p_entity_table not in ('destinations', 'places', 'experiences', 'routes',
                            'transport_connections', 'guidance_blocks', 'phrases', 'advisories') then
    raise exception 'Cannot publish %', p_entity_table using errcode = 'check_violation';
  end if;

  if p_actor is null or not exists (
    select 1 from user_roles where user_id = p_actor and role in ('approver', 'admin')
  ) then
    raise exception 'Publishing needs the approver role' using errcode = 'insufficient_privilege';
  end if;

  problems := validate_for_publish_rules(p_entity_table, p_entity_id);
  if jsonb_array_length(problems) > 0 then
    raise exception 'Not ready to publish: %', problems::text using errcode = 'check_violation';
  end if;

  select v.changed_by into last_editor
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id and v.changed_by is not null
   order by v.version desc
   limit 1;

  if last_editor is not null and last_editor = p_actor then
    raise exception 'Separation of duties: you last changed this, so someone else must approve it'
      using errcode = 'check_violation';
  end if;

  execute format(
    'update %I set status = ''published'', published_at = now() where id = $1',
    p_entity_table
  ) using p_entity_id;

  insert into audit_log (actor_user_id, action, entity_table, entity_id, after)
  values (p_actor, 'publish', p_entity_table, p_entity_id, jsonb_build_object('status', 'published'));

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

  insert into knowledge_updates (entity_table, entity_id, destination_id, changed_fields, published_by)
  values (p_entity_table, p_entity_id, v_destination, v_fields, p_actor);

  return jsonb_build_object('published', true);
end;
$$;

revoke all on function publish_entity_as(text, uuid, uuid) from public, anon, authenticated;

create or replace function publish_entity(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return publish_entity_as(p_entity_table, p_entity_id, (select auth.uid()));
end;
$$;

comment on function publish_entity(text, uuid) is
  'The only client path to published status: publish_entity_as() for the signed-in approver.';

revoke all on function publish_entity(text, uuid) from public, anon;
grant execute on function publish_entity(text, uuid) to authenticated;

create table if not exists publish_schedules (
  id           uuid primary key default gen_random_uuid(),
  entity_table text not null check (entity_table in (
                 'destinations', 'places', 'experiences', 'routes',
                 'transport_connections', 'guidance_blocks', 'phrases', 'advisories')),
  entity_id    uuid not null,
  publish_at   timestamptz not null,
  scheduled_by uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'scheduled'
                 check (status in ('scheduled', 'published', 'cancelled', 'blocked')),
  -- Why a scheduled publish did not happen: a SQLSTATE and the rule's own message, never row data.
  outcome      jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists publish_schedules_one_pending
  on publish_schedules (entity_table, entity_id) where status = 'scheduled';
create index if not exists publish_schedules_due
  on publish_schedules (publish_at) where status = 'scheduled';

alter table publish_schedules enable row level security;

create trigger publish_schedules_set_updated_at
  before update on publish_schedules for each row execute function set_updated_at();
create trigger publish_schedules_audit
  after insert or update or delete on publish_schedules
  for each row execute function audit_ops_change();

-- Read by Ops; written only through the two functions below.
grant select on publish_schedules to authenticated;
create policy publish_schedules_ops_read on publish_schedules
  for select to authenticated using (is_ops());

/*
 * Schedules a publish. The rules are checked now AND again when it runs: an entity edited
 * after it was scheduled must still be valid, and must not have been last edited by the
 * approver who scheduled it.
 */
create or replace function schedule_publish(
  p_entity_table text,
  p_entity_id uuid,
  p_publish_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
  v_problems jsonb;
  v_last_editor uuid;
  v_id uuid;
begin
  if not has_any_role('approver', 'admin') then
    raise exception 'Publishing needs the approver role' using errcode = 'insufficient_privilege';
  end if;

  if p_publish_at <= now() then
    raise exception 'Choose a time in the future, or publish now'
      using errcode = 'invalid_parameter_value';
  end if;

  v_problems := validate_for_publish_rules(p_entity_table, p_entity_id);
  if jsonb_array_length(v_problems) > 0 then
    raise exception 'Not ready to publish: %', v_problems::text using errcode = 'check_violation';
  end if;

  select v.changed_by into v_last_editor
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id and v.changed_by is not null
   order by v.version desc
   limit 1;

  if v_last_editor is not null and v_last_editor = v_actor then
    raise exception 'Separation of duties: you last changed this, so someone else must approve it'
      using errcode = 'check_violation';
  end if;

  update publish_schedules
     set status = 'cancelled'
   where entity_table = p_entity_table and entity_id = p_entity_id and status = 'scheduled';

  insert into publish_schedules (entity_table, entity_id, publish_at, scheduled_by)
  values (p_entity_table, p_entity_id, p_publish_at, v_actor)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function cancel_scheduled_publish(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_any_role('approver', 'admin') then
    raise exception 'Only an approver can change a scheduled publish'
      using errcode = 'insufficient_privilege';
  end if;

  update publish_schedules set status = 'cancelled'
   where id = p_schedule_id and status = 'scheduled';
end;
$$;

/*
 * The job. Each due schedule publishes in its own subtransaction, so one entity that is no
 * longer valid is marked `blocked` with its reason and the rest still go out.
 */
create or replace function publish_scheduled_entities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_published int := 0;
  v_blocked int := 0;
begin
  for r in
    select id, entity_table, entity_id, scheduled_by
      from publish_schedules
     where status = 'scheduled' and publish_at <= now()
     order by publish_at
     for update skip locked
  loop
    begin
      perform publish_entity_as(r.entity_table, r.entity_id, r.scheduled_by);
      update publish_schedules
         set status = 'published', outcome = jsonb_build_object('published_at', now())
       where id = r.id;
      v_published := v_published + 1;
    exception when others then
      update publish_schedules
         set status = 'blocked',
             outcome = jsonb_build_object('sqlstate', sqlstate,
                                          'reason', split_part(sqlerrm, ':', 1))
       where id = r.id;
      v_blocked := v_blocked + 1;
    end;
  end loop;

  return jsonb_build_object('published', v_published, 'blocked', v_blocked);
end;
$$;

revoke all on function schedule_publish(text, uuid, timestamptz) from public, anon;
revoke all on function cancel_scheduled_publish(uuid) from public, anon;
revoke all on function publish_scheduled_entities() from public, anon, authenticated;
grant execute on function schedule_publish(text, uuid, timestamptz) to authenticated;
grant execute on function cancel_scheduled_publish(uuid) to authenticated;

-- The jobs wrapper learns the new job; body otherwise identical to 0013.
create or replace function run_scheduled_job(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_detail jsonb;
begin
  if p_name not in ('recompute_freshness', 'roll_journey_statuses', 'purge_deleted_accounts',
                    'prune_ai_cache', 'prune_rate_limits', 'publish_scheduled_entities') then
    raise exception 'Unknown job: %', p_name;
  end if;

  if not pg_try_advisory_lock(hashtext('mandhira_job:' || p_name)) then
    insert into job_runs (job_name, status, finished_at, detail)
    values (p_name, 'skipped', now(), jsonb_build_object('reason', 'already_running'));
    return jsonb_build_object('skipped', true);
  end if;

  insert into job_runs (job_name) values (p_name) returning id into v_run_id;

  begin
    case p_name
      when 'recompute_freshness'        then v_detail := recompute_freshness();
      when 'roll_journey_statuses'      then v_detail := roll_journey_statuses();
      when 'purge_deleted_accounts'     then v_detail := purge_deleted_accounts();
      when 'prune_ai_cache'             then v_detail := jsonb_build_object('deleted', prune_ai_cache());
      when 'prune_rate_limits'          then v_detail := jsonb_build_object('deleted', prune_rate_limits());
      when 'publish_scheduled_entities' then v_detail := publish_scheduled_entities();
    end case;
  exception when others then
    update job_runs
    set status = 'failed', finished_at = now(),
        detail = jsonb_build_object('error', sqlstate)
    where id = v_run_id;

    perform pg_advisory_unlock(hashtext('mandhira_job:' || p_name));
    return jsonb_build_object('failed', true, 'error', sqlstate);
  end;

  update job_runs
  set status = 'succeeded', finished_at = now(), detail = v_detail
  where id = v_run_id;

  perform pg_advisory_unlock(hashtext('mandhira_job:' || p_name));

  return v_detail;
end;
$$;

revoke all on function run_scheduled_job(text) from public, anon, authenticated;

-- The job-health view learns it too, so a scheduler that stops is noticed within two windows.
create or replace view v_job_health as
select
  expected.job_name,
  expected.interval_seconds,
  last.started_at as last_run_at,
  last.status as last_status,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    as missed_two_windows,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    or last.status <> 'succeeded'
    as needs_attention
from (values
  ('recompute_freshness', 86400),
  ('roll_journey_statuses', 3600),
  ('purge_deleted_accounts', 86400),
  ('prune_ai_cache', 86400),
  ('prune_rate_limits', 86400),
  ('publish_scheduled_entities', 300)
) as expected(job_name, interval_seconds)
left join lateral (
  select r.started_at, r.status
  from job_runs r
  where r.job_name = expected.job_name and r.status <> 'skipped'
  order by r.started_at desc
  limit 1
) as last on true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'publish_scheduled_entities') then
    perform cron.unschedule('publish_scheduled_entities');
  end if;
  perform cron.schedule('publish_scheduled_entities', '*/5 * * * *',
                        $job$select run_scheduled_job('publish_scheduled_entities')$job$);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- O20 · Restoring an earlier version
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Writes a recorded snapshot back onto its row, and sends anything published back to review.
 *
 * Restored content is still content nobody has approved in its current form, so a published
 * entity returns to `in_review` rather than going live as-is. Identity, lifecycle and
 * timestamps are never restored — only what the entity says.
 */
create or replace function restore_entity_version(
  p_entity_table text,
  p_entity_id uuid,
  p_version int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_columns text;
  v_values text;
  v_has_status boolean;
  v_status text;
begin
  if not has_any_role('editor', 'admin') then
    raise exception 'Restoring a version needs the editor role' using errcode = 'insufficient_privilege';
  end if;

  if p_entity_table not in ('destinations', 'circuits', 'places', 'routes', 'accessibility_records',
                            'experiences', 'availability_rules', 'transport_connections',
                            'guidance_blocks', 'phrases', 'advisories', 'live_feed_configs',
                            'media_assets') then
    raise exception 'Versions of % cannot be restored', p_entity_table using errcode = 'check_violation';
  end if;

  select snapshot into v_snapshot
    from entity_versions
   where entity_table = p_entity_table and entity_id = p_entity_id and version = p_version;

  if v_snapshot is null then
    raise exception 'That version does not exist' using errcode = 'no_data_found';
  end if;

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
         string_agg(format('r.%I', c.column_name), ', ' order by c.ordinal_position)
    into v_columns, v_values
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_entity_table
     and c.is_generated = 'NEVER'
     and c.column_name not in ('id', 'status', 'published_at', 'created_at', 'updated_at',
                               'deleted_at', 'uploaded_by');

  execute format(
    'update %I t set (%s) = (select %s from jsonb_populate_record(null::%I, $1) r) where t.id = $2',
    p_entity_table, v_columns, v_values, p_entity_table
  ) using v_snapshot, p_entity_id;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = p_entity_table and column_name = 'status'
  ) into v_has_status;

  if v_has_status then
    execute format(
      'update %I set status = ''in_review'' where id = $1 and status = ''published'' returning status::text',
      p_entity_table
    ) into v_status using p_entity_id;
  end if;

  return jsonb_build_object('restored_version', p_version, 'returned_to_review', v_status is not null);
end;
$$;

revoke all on function restore_entity_version(text, uuid, int) from public, anon;
grant execute on function restore_entity_version(text, uuid, int) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- O21 · The Ops team
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Everyone holding at least one Ops role, with their roles. Admin only.
 *
 * Deliberately NOT every account: travelers are not Ops's to browse. Granting a role to a
 * new person goes through `ops_find_account`, which answers one exact email at a time.
 */
create or replace function ops_team()
returns table (
  user_id uuid,
  email text,
  display_name text,
  roles ops_role_enum[],
  first_granted_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_role('admin') then
    raise exception 'Managing the team needs the admin role' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id, u.email::text, p.display_name,
           array_agg(r.role order by r.role), min(r.granted_at), u.last_sign_in_at
      from user_roles r
      join auth.users u on u.id = r.user_id
      left join profiles p on p.id = u.id
     group by u.id, u.email, p.display_name, u.last_sign_in_at
     order by lower(u.email::text);
end;
$$;

create or replace function ops_find_account(p_email text)
returns table (user_id uuid, email text, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_role('admin') then
    raise exception 'Managing the team needs the admin role' using errcode = 'insufficient_privilege';
  end if;

  return query
    select u.id, u.email::text, p.display_name
      from auth.users u
      left join profiles p on p.id = u.id
     where lower(u.email::text) = lower(btrim(p_email))
       and (p.deleted_at is null)
     limit 1;
end;
$$;

revoke all on function ops_team() from public, anon;
revoke all on function ops_find_account(text) from public, anon;
grant execute on function ops_team() to authenticated;
grant execute on function ops_find_account(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- O01 · Knowledge health
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function knowledge_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not is_ops() then
    raise exception 'The knowledge dashboard is for Ops' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'generated_at', now(),

    'trust', (
      select jsonb_build_object(
        'total', count(*),
        'fresh', count(*) filter (where freshness = 'fresh'),
        'aging', count(*) filter (where freshness = 'aging'),
        'stale', count(*) filter (where freshness = 'stale'),
        'low_confidence', count(*) filter (where confidence = 'low'),
        'conflicted', count(*) filter (where conflict_flag),
        'unverified', count(*) filter (where verification_status in ('unverified', 'ai_extracted')))
      from trust_records),

    'queues', jsonb_build_object(
      'review', (select jsonb_build_object('open', count(*), 'oldest_at', min(created_at))
                   from change_candidates where status = 'open'),
      'verify', (select jsonb_build_object('open', count(*), 'oldest_at', min(created_at))
                   from review_tasks where task_type = 'verify' and status in ('open', 'in_progress')),
      'reverify', (select jsonb_build_object('open', count(*), 'oldest_at', min(created_at))
                     from review_tasks where task_type = 'reverify' and status in ('open', 'in_progress')),
      'conflicts', (select jsonb_build_object('open', count(*), 'oldest_at', min(created_at))
                      from conflicts where status in ('open', 'escalated')),
      'reports', (select jsonb_build_object('open', count(*), 'oldest_at', min(created_at))
                    from user_reports where status in ('new', 'triaged', 'verifying')),
      'publish', (select jsonb_build_object('open', sum(n), 'oldest_at', min(oldest))
                    from (
                      select count(*) as n, min(updated_at) as oldest from destinations where status = 'in_review'
                      union all select count(*), min(updated_at) from places where status = 'in_review'
                      union all select count(*), min(updated_at) from experiences where status = 'in_review'
                      union all select count(*), min(updated_at) from routes where status = 'in_review'
                      union all select count(*), min(updated_at) from transport_connections where status = 'in_review'
                      union all select count(*), min(updated_at) from guidance_blocks where status = 'in_review'
                      union all select count(*), min(updated_at) from phrases where status = 'in_review'
                      union all select count(*), min(updated_at) from advisories where status = 'in_review'
                    ) q),
      'scheduled', (select jsonb_build_object('open', count(*), 'next_at', min(publish_at))
                      from publish_schedules where status = 'scheduled')
    ),

    'locales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', l.code,
               'name', l.name_en,
               'published', totals.published,
               'translated', (
                 select count(*) from (
                   select name_i18n from destinations where status = 'published' and deleted_at is null
                   union all select name_i18n from places where status = 'published' and deleted_at is null
                   union all select name_i18n from experiences where status = 'published' and deleted_at is null
                 ) e
                 where coalesce(btrim(e.name_i18n ->> l.code), '') <> '')
             ) order by l.sort_order)
        from locales l
        cross join (
          select (select count(*) from destinations where status = 'published' and deleted_at is null)
               + (select count(*) from places where status = 'published' and deleted_at is null)
               + (select count(*) from experiences where status = 'published' and deleted_at is null)
                 as published
        ) totals
       where l.is_active), '[]'::jsonb),

    'destinations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'slug', d.slug,
               'name', coalesce(d.name_i18n ->> 'en', d.slug),
               'status', d.status,
               'places', (select count(*) from places p
                           where p.destination_id = d.id and p.status = 'published' and p.deleted_at is null),
               'experiences', (select count(*) from experiences e
                                where e.destination_id = d.id and e.status = 'published' and e.deleted_at is null),
               'routes', (select count(*) from routes r
                           where r.destination_id = d.id and r.status = 'published' and r.deleted_at is null),
               'advisories', (select count(*) from advisories a
                               where a.destination_id = d.id and a.status = 'published'))
             order by d.slug)
        from destinations d where d.deleted_at is null), '[]'::jsonb),

    'jobs', coalesce((select jsonb_agg(to_jsonb(h)) from v_job_health h), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function knowledge_health() from public, anon;
grant execute on function knowledge_health() to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- O22 · Product signals
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Counts by event and by day. Never rows: `analytics_events` holds no user id by design
 * (TRD §4.7), and an Ops screen that listed events would still show one visit's path through
 * the product — aggregation is what keeps it a product signal and not a person.
 */
create or replace function product_signals(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180));
begin
  if not has_any_role('admin', 'editor', 'approver') then
    raise exception 'Product signals need an admin, editor or approver role'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'since', v_since,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event', e.event_name, 'total', e.total, 'offline', e.offline) order by e.total desc)
        from (
          select event_name, count(*) as total, count(*) filter (where is_offline) as offline
            from analytics_events where created_at >= v_since group by event_name
        ) e), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'event', d.event_name, 'count', d.n)
                       order by d.day, d.event_name)
        from (
          select (created_at at time zone 'Asia/Kolkata')::date as day, event_name, count(*) as n
            from analytics_events where created_at >= v_since group by 1, 2
        ) d), '[]'::jsonb),
    'locales', coalesce((
      select jsonb_object_agg(coalesce(locale, 'unknown'), n)
        from (
          select locale, count(*) as n from analytics_events where created_at >= v_since group by locale
        ) l), '{}'::jsonb)
  );
end;
$$;

revoke all on function product_signals(int) from public, anon;
grant execute on function product_signals(int) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- One definition of "published"
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 0013's backend-only `is_entity_published` and 0029's `entity_is_published` answered the same
-- question in two bodies over slightly different table lists. The freshness job now asks the
-- same function the published views and client helpers do, so the two cannot drift.

create or replace function is_entity_published(p_entity_table text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select entity_is_published(p_entity_table, p_entity_id);
$$;

comment on function is_entity_published(text, uuid) is
  'Backend alias of entity_is_published(), kept for the jobs that already call it (0032).';

revoke all on function is_entity_published(text, uuid) from public, anon, authenticated;
