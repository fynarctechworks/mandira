-- ══════════════════════════════════════════════════════════════════════════════
-- 0043 · One traveler, one profile
--
-- `create_journey` (0031) inserted a fresh `traveler_profiles` row for every traveler of
-- every journey. A traveler who planned ten trips had ten "You" rows and ten copies of
-- Amma on their Travelers page — the design review found about fifty on one account — and
-- the page that exists to say "the people you usually travel with" listed strangers' worth
-- of duplicates.
--
--   1. `create_journey` now links each traveler in the brief to the owner's oldest saved,
--      not-removed profile of the SAME person — same self flag, name (case and surrounding
--      space ignored), mobility and age group — and creates a profile only when there is
--      none. A match is exact on purpose: a journey planned for Amma in a wheelchair must not
--      rewrite the Amma every earlier journey was planned around. Two identical travelers in
--      one brief (twins) still get two profiles. SECURITY INVOKER as before, so every read
--      and write is the traveler's own RLS.
--   2. `merge_duplicate_traveler_profiles()` folds the duplicates already stored: identical
--      live profiles of one owner collapse into the oldest, their journey links move to it,
--      and the copies are removed. Run once here; callable by nobody but the database owner.
--
-- Profiles stay the traveler's own data: nothing here is reachable from Ops (PRD-PRIV-002).
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function create_journey(p_journey jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := (select auth.uid());
  v_journey uuid;
  v_traveler record;
  v_profile uuid;
  v_used uuid[] := '{}';
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

  for v_traveler in
    select nullif(btrim(e.value ->> 'label'), '') as label,
           (e.value ->> 'mobility')::mobility_enum as mobility,
           (e.value ->> 'age_band')::age_band_enum as age_band,
           coalesce((e.value ->> 'is_self')::boolean, false) as is_self
      from jsonb_array_elements(coalesce(p_journey -> 'travelers', '[]'::jsonb))
           with ordinality as e(value, position)
     order by e.position
  loop
    v_profile := null;

    select p.id into v_profile
      from traveler_profiles p
     where p.owner_user_id = v_owner
       and p.deleted_at is null
       and p.is_self = v_traveler.is_self
       and lower(coalesce(btrim(p.label), '')) = lower(coalesce(v_traveler.label, ''))
       and p.mobility = v_traveler.mobility
       and p.age_band = v_traveler.age_band
       and p.id <> all (v_used)
     order by p.created_at, p.id
     limit 1;

    if v_profile is null then
      insert into traveler_profiles (owner_user_id, label, mobility, age_band, is_self)
      values (v_owner, v_traveler.label, v_traveler.mobility, v_traveler.age_band,
              v_traveler.is_self)
      returning id into v_profile;
    end if;

    v_used := v_used || v_profile;

    insert into journey_travelers (journey_id, traveler_profile_id)
    values (v_journey, v_profile);
  end loop;

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
  'signed-in traveler (0031, OPEN-012); reuses an identical saved traveler profile (0043).';

revoke all on function create_journey(jsonb) from public, anon;
grant execute on function create_journey(jsonb) to authenticated;

-- ── Folding the duplicates already stored ───────────────────────────────────────────────

create or replace function merge_duplicate_traveler_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed integer;
begin
  with ranked as (
    select id,
           dense_rank() over (
             order by owner_user_id, is_self, lower(coalesce(btrim(label), '')),
                      mobility, age_band, dietary_tags, locale
           ) as person,
           first_value(id) over (
             partition by owner_user_id, is_self, lower(coalesce(btrim(label), '')),
                          mobility, age_band, dietary_tags, locale
             order by created_at, id
           ) as keep_id
      from traveler_profiles
     where deleted_at is null
  ),
  -- Identical profiles on the SAME journey are different people (twins, two children), the
  -- rule create_journey follows. A profile that has ever travelled with an identical one is
  -- left exactly as it is; only copies that never shared a journey are folded.
  travelled_together as (
    select distinct a.traveler_profile_id as id
      from journey_travelers a
      join journey_travelers b
        on b.journey_id = a.journey_id and b.traveler_profile_id <> a.traveler_profile_id
      join ranked ra on ra.id = a.traveler_profile_id
      join ranked rb on rb.id = b.traveler_profile_id and rb.person = ra.person
  ),
  copies as (
    select r.id, r.keep_id
      from ranked r
     where r.id <> r.keep_id
       and r.id not in (select id from travelled_together)
       and r.keep_id not in (select id from travelled_together)
  ),
  relinked as (
    insert into journey_travelers (journey_id, traveler_profile_id)
    select jt.journey_id, c.keep_id
      from journey_travelers jt
      join copies c on c.id = jt.traveler_profile_id
    on conflict do nothing
    returning 1
  )
  -- The copies' own links go with them (on delete cascade), after the new links exist.
  delete from traveler_profiles p
   using copies c
   where p.id = c.id;

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

comment on function merge_duplicate_traveler_profiles() is
  'Collapses identical live traveler profiles of one owner into the oldest, keeping every journey link (0043).';

revoke all on function merge_duplicate_traveler_profiles() from public, anon, authenticated;

select merge_duplicate_traveler_profiles();
