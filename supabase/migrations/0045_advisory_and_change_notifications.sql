-- ══════════════════════════════════════════════════════════════════════════════
-- 0045 · The two PRD F15 notifications nothing queued
--
-- `notification_type_enum` has carried `advisory` and `journey_change` since 0001, the
-- catalogs have their copy, and the sender delivers them — but nothing ever wrote one.
--
--   1. Destination advisory — "when Ops publishes one for an upcoming journey". When an
--      advisory becomes published, every traveler with an upcoming or active journey to that
--      destination whose days the advisory's window touches is told once, in the app, by
--      push, and by email if they opted in. Their own switch is honoured, and PRD F15's
--      "never more than 1 non-journey notification per week" holds (the engine counts
--      advisories as non-journey, notify.ts `applyWeeklyCap`).
--   2. Change affecting your journey — "immediately, opens Change Card". A Change Card needs
--      the travelers' profiles, which Ops may never read (CLAUDE.md §5), so the card is still
--      evaluated in the traveler's own session when they open the journey (knowledge-check,
--      D-111). What happens here, the moment a correction is published, is the notice: every
--      upcoming or active journey with an item still ahead that uses the republished place,
--      experience, route or connection gets one, linked to that journey. At most one per
--      journey per 12 hours — four corrections overnight are one piece of news.
--
-- Both run SECURITY DEFINER from triggers, touch `journeys`, `journey_items` and
-- `profiles.notification_prefs` only — never `traveler_profiles` — and are callable by no
-- client role.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Advisories ───────────────────────────────────────────────────────────────────────

create or replace function queue_advisory_notifications(p_advisory_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_advisory advisories%rowtype;
  v_count integer;
begin
  select * into v_advisory from advisories where id = p_advisory_id;
  if not found or v_advisory.status <> 'published' then
    return 0;
  end if;

  with targets as (
    -- One notice per traveler, about their soonest journey there.
    select distinct on (j.owner_user_id) j.owner_user_id as user_id, j.id as journey_id
      from journeys j
      join journey_destinations jd on jd.journey_id = j.id
      join profiles p on p.id = j.owner_user_id
     where jd.destination_id = v_advisory.destination_id
       and j.deleted_at is null
       and j.status in ('upcoming', 'active')
       and p.deleted_at is null
       and coalesce((p.notification_prefs ->> 'advisory')::boolean, true)
       -- The advisory's window touches the journey's days (an open end touches everything).
       and (v_advisory.ends_at is null or j.start_date is null
            or (v_advisory.ends_at at time zone j.timezone)::date >= j.start_date)
       and (v_advisory.starts_at is null or j.start_date is null
            or (v_advisory.starts_at at time zone j.timezone)::date <= coalesce(j.end_date, j.start_date))
       -- Once per traveler per advisory, however often it is republished.
       and not exists (
         select 1 from notifications n
          where n.user_id = j.owner_user_id
            and n.notification_type = 'advisory'
            and n.payload ->> 'advisoryId' = p_advisory_id::text)
       -- PRD F15: never more than one non-journey notification a week.
       and not exists (
         select 1 from notifications n
          where n.user_id = j.owner_user_id
            and n.notification_type in ('advisory', 'suggestion')
            and n.status in ('scheduled', 'sent')
            and n.created_at > now() - interval '7 days')
     order by j.owner_user_id, j.start_date nulls last
  ),
  queued as (
    insert into notifications
      (user_id, journey_id, notification_type, channel, status, scheduled_for,
       title_i18n, body_i18n, payload)
    select t.user_id, t.journey_id, 'advisory', channel, 'scheduled', now(),
           '{"key": "notify.advisory.title"}'::jsonb,
           '{"key": "notify.advisory.body"}'::jsonb,
           jsonb_build_object('advisoryId', p_advisory_id,
                              'destinationId', v_advisory.destination_id)
      from targets t
     cross join unnest(array['inapp', 'push', 'email']) as channel
    returning 1
  )
  select count(*) into v_count from queued;

  return v_count;
end;
$$;

comment on function queue_advisory_notifications(uuid) is
  'PRD F15: tells travelers with an upcoming journey to a destination about a published advisory, once, within their switches and the weekly cap (0045).';

create or replace function advisories_notify_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform queue_advisory_notifications(new.id);
  end if;
  return new;
end;
$$;

create trigger advisories_notify_on_publish
  after insert or update of status on advisories
  for each row execute function advisories_notify_on_publish();

-- ── 2. Published corrections to something a journey uses ───────────────────────────────

create or replace function queue_change_notifications(p_update_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update knowledge_updates%rowtype;
  v_count integer;
begin
  select * into v_update from knowledge_updates where id = p_update_id;
  if not found
     or v_update.entity_table not in ('experiences', 'places', 'routes', 'transport_connections') then
    return 0;
  end if;

  with targets as (
    select distinct j.owner_user_id as user_id, j.id as journey_id
      from journeys j
      join journey_items i on i.journey_id = j.id
      join profiles p on p.id = j.owner_user_id
     where j.deleted_at is null
       and j.status in ('upcoming', 'active')
       and coalesce(j.end_date, j.start_date) >= (now() at time zone j.timezone)::date
       and i.deleted_at is null
       -- Only what is still ahead: a correction to something already done is history.
       and i.status::text in ('planned', 'in_progress')
       and case v_update.entity_table
             when 'experiences' then i.experience_id = v_update.entity_id
             when 'places' then i.place_id = v_update.entity_id
             when 'routes' then i.route_id = v_update.entity_id
             else i.transport_connection_id = v_update.entity_id
           end
       and p.deleted_at is null
       and coalesce((p.notification_prefs ->> 'journey_change')::boolean, true)
       and not exists (
         select 1 from notifications n
          where n.journey_id = j.id
            and n.notification_type = 'journey_change'
            and n.created_at > now() - interval '12 hours')
  ),
  queued as (
    insert into notifications
      (user_id, journey_id, notification_type, channel, status, scheduled_for,
       title_i18n, body_i18n, payload)
    select t.user_id, t.journey_id, 'journey_change', channel, 'scheduled', now(),
           '{"key": "notify.journey_change.title"}'::jsonb,
           '{"key": "notify.journey_change.body"}'::jsonb,
           jsonb_build_object('knowledgeUpdateId', p_update_id,
                              'entityTable', v_update.entity_table)
      from targets t
     cross join unnest(array['inapp', 'push', 'email']) as channel
    returning 1
  )
  select count(*) into v_count from queued;

  return v_count;
end;
$$;

comment on function queue_change_notifications(uuid) is
  'PRD F15: tells owners of journeys using a republished entity that something in their day changed; the Change Card is evaluated in their session (0045).';

create or replace function knowledge_updates_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform queue_change_notifications(new.id);
  return new;
end;
$$;

create trigger knowledge_updates_notify
  after insert on knowledge_updates
  for each row execute function knowledge_updates_notify();

revoke all on function queue_advisory_notifications(uuid) from public, anon, authenticated;
revoke all on function advisories_notify_on_publish() from public, anon, authenticated;
revoke all on function queue_change_notifications(uuid) from public, anon, authenticated;
revoke all on function knowledge_updates_notify() from public, anon, authenticated;
