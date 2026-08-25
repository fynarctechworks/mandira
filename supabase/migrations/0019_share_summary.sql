-- 0019_share_summary.sql — the read-only Journey Summary, and the share token that opens it.
--
-- WHY THIS IS SQL AND NOT A SELECT IN THE APP (plan PREP-01 §5a, TRD-SEC-004).
--
-- `journey_shares` carries exactly one policy — `owns_journey`. A token holder is `anon`
-- and cannot read the journey through RLS at all, so a public summary page needs SOME path
-- that reaches past it. The obvious one is a service-role client with a hand-written
-- select, and it would work today. It would also mean TRD-SEC-004's promise — "excludes
-- profiles and notes" — rests on every future editor of that file remembering it, and
-- `select('*')` is one keystroke away from being the leak.
--
-- So the projection lives here instead. It names every column it returns and cannot be
-- made to hand back `traveler_profiles`, `journey_items.note`, or `journeys.owner_user_id`
-- no matter what the caller asks for. A reviewer checks one function rather than trusting
-- a convention to hold across everyone who edits the page later.
--
-- ONE PROJECTION, TWO DOORS. The owner previewing their own summary and a stranger opening
-- a share link must see the same page — if they can diverge, the direction they diverge in
-- is a shared link showing more than the owner was shown before they sent it. So the
-- projection is written once in `journey_summary_payload`, and the two entry points differ
-- only in how they establish who may read: a valid unexpired token, or ownership.
--
-- `journey_summary_payload` is deliberately NOT granted to any client role. It takes a
-- journey id and does no permission check of its own, so granting it would let anyone who
-- can guess a uuid read any journey. Its callers are the door; it is only the room.

-- ══════════════════════════════════════════════════════════════════════════════
-- The projection. Everything the summary shows, and nothing else.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function journey_summary_payload(p_journey_id uuid, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with j as (
    select
      jr.id, jr.title, jr.start_date, jr.end_date,
      jr.timezone, jr.day_start_time, jr.day_end_time, jr.pace,
      (select jd.destination_id
         from journey_destinations jd
        where jd.journey_id = jr.id
        order by jd.sort_order
        limit 1) as destination_id
    from journeys jr
    where jr.id = p_journey_id
      and jr.deleted_at is null
  ),
  entries as (
    select
      i.id, i.day_index, i.sort_order, i.item_type, i.tier,
      i.planned_start_at, i.planned_end_at,
      i.duration_likely_minutes, i.buffer_minutes,
      coalesce(
        e.name_i18n ->> p_locale, e.name_i18n ->> 'en',
        p.name_i18n ->> p_locale, p.name_i18n ->> 'en'
      ) as label,
      coalesce(p.entry_requirements_i18n ->> p_locale,
               p.entry_requirements_i18n ->> 'en') as entry_requirements,
      coalesce(p.dress_code_i18n ->> p_locale,
               p.dress_code_i18n ->> 'en') as dress_code
    from journey_items i
    join j on j.id = i.journey_id
    -- The published views, not the base tables: the publish gate travels with the share.
    -- Sharing a journey does not launder its contents past the gate.
    left join v_published_experiences e on e.id = i.experience_id
    left join v_published_places p
           on p.id = coalesce(i.place_id, e.place_id)
    where i.deleted_at is null
    order by i.day_index, i.sort_order
  ),
  facilities as (
    -- PRD F7's "emergency/facility essentials": published facilities in the destination
    -- this journey is for. Nothing traveler-specific.
    select f.id, f.name_i18n ->> p_locale as localised, f.name_i18n ->> 'en' as fallback,
           f.facility_subtype, f.address
    from v_published_places f
    join j on j.destination_id = f.destination_id
    where f.place_type = 'facility'
    order by f.facility_subtype, f.editorial_weight desc
    limit 12
  )
  select jsonb_build_object(
    'journey', jsonb_build_object(
      'title', j.title,
      'startDate', j.start_date,
      'endDate', j.end_date,
      'timezone', j.timezone,
      'dayStartTime', j.day_start_time,
      'dayEndTime', j.day_end_time,
      'pace', j.pace
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entries.id,
        'dayIndex', entries.day_index,
        'sortOrder', entries.sort_order,
        'itemType', entries.item_type,
        'tier', entries.tier,
        'plannedStartAt', entries.planned_start_at,
        'plannedEndAt', entries.planned_end_at,
        'durationLikelyMinutes', entries.duration_likely_minutes,
        'bufferMinutes', entries.buffer_minutes,
        'label', entries.label,
        'entryRequirements', entries.entry_requirements,
        'dressCode', entries.dress_code
      )) from entries
    ), '[]'::jsonb),
    'facilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', facilities.id,
        'name', coalesce(facilities.localised, facilities.fallback),
        'subtype', facilities.facility_subtype,
        'address', facilities.address
      )) from facilities
    ), '[]'::jsonb)
  )
  from j;
$$;

comment on function journey_summary_payload(uuid, text) is
  'The Journey Summary projection (PRD-PREP-004). Structurally excludes traveler_profiles, '
  'journey_items.note and journeys.owner_user_id. Does NO permission check of its own and '
  'is granted to no client role — its callers are the door. See the 0019 header.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Door one: a share token (TRD-SEC-004).
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function share_summary(p_token text, p_locale text default 'en')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Expiry is enforced HERE rather than in the page: a check in the app is a check the
  -- next caller can forget to make. Unknown, expired and revoked all return null — telling
  -- a caller which one it was confirms that a journey exists.
  select journey_summary_payload(s.journey_id, p_locale)
  from journey_shares s
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now());
$$;

comment on function share_summary(text, text) is
  'The Journey Summary for a share token. Null for an unknown, expired or revoked token.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Door two: the owner, previewing what they are about to send.
--
-- SECURITY DEFINER because it calls the projection, which client roles cannot execute —
-- so it must do the ownership check itself rather than leaning on RLS. That check is the
-- whole reason this function exists, and it is the line to read first in review.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function my_journey_summary(p_journey_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select journey_summary_payload(jr.id, p_locale)
  from journeys jr
  where jr.id = p_journey_id
    and jr.owner_user_id = (select auth.uid())
    and jr.deleted_at is null;
$$;

comment on function my_journey_summary(uuid, text) is
  'The Journey Summary for a journey the CALLER owns — the owner-side preview of exactly '
  'what a share link shows. Checks ownership itself; see the 0019 header.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Grants, explicit rather than inherited from PUBLIC: a role added later must be given
-- these on purpose.
--
-- `anon` on share_summary is the point — a share link is opened signed out. Nothing is
-- granted on journey_summary_payload, which is what keeps a bare journey id useless.
-- ══════════════════════════════════════════════════════════════════════════════

revoke all on function journey_summary_payload(uuid, text) from public;
revoke all on function share_summary(text, text) from public;
revoke all on function my_journey_summary(uuid, text) from public;

grant execute on function share_summary(text, text) to anon, authenticated;
grant execute on function my_journey_summary(uuid, text) to authenticated;

-- The token lookup is already an index scan (`token` is unique). The expiry sweep is what
-- needs help.
create index if not exists journey_shares_expires_idx
  on journey_shares (expires_at)
  where expires_at is not null;
