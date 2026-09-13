-- 0031_create_journey.sql — a journey is saved whole or not at all (OPEN-012).
--
-- `POST /api/journeys` wrote the journey, its destination, traveler profiles, the link rows
-- and the items as five separate statements, and checked the error of only the first. A
-- failure on any later one left a journey with no items, or items with no travelers, and
-- the route still answered `{ok:true}`. The traveler would open a plan that was half there.
--
-- One function, one transaction. SECURITY INVOKER, so every insert is still checked by the
-- traveler's own RLS policies; the owner is taken from the session and never from the
-- payload, so the function cannot be used to create a journey for somebody else.

create or replace function create_journey(p_journey jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := (select auth.uid());
  v_journey uuid;
begin
  if v_owner is null then
    raise exception 'Sign in to save a journey' using errcode = 'insufficient_privilege';
  end if;

  insert into journeys (
    owner_user_id, title, start_date, end_date, timezone, day_start_time, day_end_time,
    pace, brief
  )
  values (
    v_owner,
    nullif(p_journey ->> 'title', ''),
    (p_journey ->> 'start_date')::date,
    (p_journey ->> 'end_date')::date,
    coalesce(p_journey ->> 'timezone', 'Asia/Kolkata'),
    coalesce((p_journey ->> 'day_start_time')::time, '06:00'),
    coalesce((p_journey ->> 'day_end_time')::time, '21:00'),
    coalesce((p_journey ->> 'pace')::pace_enum, 'balanced'),
    p_journey -> 'brief'
  )
  returning id into v_journey;

  insert into journey_destinations (journey_id, destination_id, sort_order)
  select v_journey, d.value::uuid, (d.position - 1)::int
    from jsonb_array_elements_text(coalesce(p_journey -> 'destination_ids', '[]'::jsonb))
         with ordinality as d(value, position);

  with created as (
    insert into traveler_profiles (owner_user_id, label, mobility, age_band, is_self)
    select v_owner, t.label, t.mobility, t.age_band, coalesce(t.is_self, false)
      from jsonb_to_recordset(coalesce(p_journey -> 'travelers', '[]'::jsonb))
           as t(label text, mobility mobility_enum, age_band age_band_enum, is_self boolean)
    returning id
  )
  insert into journey_travelers (journey_id, traveler_profile_id)
  select v_journey, id from created;

  insert into journey_items (
    journey_id, day_index, sort_order, item_type, tier, experience_id, place_id,
    fixed_start_at, fixed_end_at, preferred_window_start, preferred_window_end,
    planned_start_at, planned_end_at, duration_likely_minutes, buffer_minutes
  )
  select v_journey, i.day_index, i.sort_order, i.item_type, i.tier, i.experience_id, i.place_id,
         i.fixed_start_at, i.fixed_end_at, i.preferred_window_start, i.preferred_window_end,
         i.planned_start_at, i.planned_end_at, i.duration_likely_minutes,
         coalesce(i.buffer_minutes, 15)
    from jsonb_to_recordset(coalesce(p_journey -> 'items', '[]'::jsonb)) as i(
           day_index int, sort_order int, item_type journey_item_type_enum,
           tier priority_tier_enum, experience_id uuid, place_id uuid,
           fixed_start_at timestamptz, fixed_end_at timestamptz,
           preferred_window_start time, preferred_window_end time,
           planned_start_at timestamptz, planned_end_at timestamptz,
           duration_likely_minutes int, buffer_minutes int
         );

  return v_journey;
end;
$$;

comment on function create_journey(jsonb) is
  'Saves a journey with its destinations, travelers and items in one transaction, as the '
  'signed-in traveler (0031, OPEN-012).';

revoke all on function create_journey(jsonb) from public, anon;
grant execute on function create_journey(jsonb) to authenticated;
