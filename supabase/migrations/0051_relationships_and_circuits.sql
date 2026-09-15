-- 0051_relationships_and_circuits.sql — PRD-OPS-CNT-002: nearby curation, circuit builder,
-- and what a place is connected to (PRD F19 "Relationship tools").
--
-- `destination_links`, `circuits` and `circuit_destinations` have existed since 0003, and the
-- traveler destination page reads published nearby links (0044), but nothing in Ops wrote
-- them. Replacing a set of links means removing rows, and RLS keeps DELETE for admins (0008),
-- so — as for route stops (0042) — each set is replaced in one transaction by a function for
-- the roles that may edit it. The tables' own audit triggers (0029) still record every row.

-- ══════════════════════════════════════════════════════════════════════════════
-- Nearby destinations
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function set_destination_links(p_destination_id uuid, p_links jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not has_any_role('researcher', 'editor', 'approver', 'admin') then
    raise exception 'not allowed to edit destinations' using errcode = '42501';
  end if;

  if jsonb_typeof(p_links) is distinct from 'array' then
    raise exception 'links must be a list' using errcode = '22023';
  end if;

  if not exists (select 1 from destinations where id = p_destination_id and deleted_at is null) then
    raise exception 'That destination no longer exists.' using errcode = 'P0002';
  end if;

  if jsonb_array_length(p_links) > 20 then
    raise exception 'Link at most 20 nearby destinations.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from jsonb_array_elements(p_links) l
              where (l ->> 'nearby_destination_id')::uuid = p_destination_id) then
    raise exception 'A destination cannot be nearby itself.' using errcode = 'check_violation';
  end if;

  if (select count(distinct l ->> 'nearby_destination_id') from jsonb_array_elements(p_links) l)
       <> jsonb_array_length(p_links) then
    raise exception 'Each nearby destination can be listed once.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from jsonb_array_elements(p_links) l
              where not exists (select 1 from destinations d
                                 where d.id = (l ->> 'nearby_destination_id')::uuid
                                   and d.deleted_at is null)) then
    raise exception 'One of those destinations no longer exists.' using errcode = 'check_violation';
  end if;

  delete from destination_links where destination_id = p_destination_id;

  insert into destination_links (destination_id, nearby_destination_id, note_i18n)
  select p_destination_id,
         (l ->> 'nearby_destination_id')::uuid,
         case when jsonb_typeof(l -> 'note_i18n') = 'object' then l -> 'note_i18n' else '{}'::jsonb end
    from jsonb_array_elements(p_links) l;

  get diagnostics v_count = row_count;

  insert into audit_log (action, actor_user_id, entity_table, entity_id, after)
  values ('destination_links_set', (select auth.uid()), 'destinations', p_destination_id,
          jsonb_build_object('links', p_links));

  return v_count;
end;
$$;

comment on function set_destination_links(uuid, jsonb) is
  'Replaces a destination''s nearby links in one transaction for the roles that may edit destinations; audited (0051).';

revoke all on function set_destination_links(uuid, jsonb) from public, anon;
grant execute on function set_destination_links(uuid, jsonb) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Circuits: destinations in order
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function set_circuit_destinations(p_circuit_id uuid, p_destination_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_destination_ids, '{}');
  v_count integer;
begin
  if not has_any_role('researcher', 'editor', 'approver', 'admin') then
    raise exception 'not allowed to edit circuits' using errcode = '42501';
  end if;

  if not exists (select 1 from circuits where id = p_circuit_id) then
    raise exception 'That circuit no longer exists.' using errcode = 'P0002';
  end if;

  if cardinality(v_ids) > 50 then
    raise exception 'A circuit can hold at most 50 destinations.' using errcode = 'check_violation';
  end if;

  if array_position(v_ids, null) is not null
     or (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
    raise exception 'Each destination can be in a circuit once.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from destinations d where d.id = x and d.deleted_at is null)) then
    raise exception 'One of those destinations no longer exists.' using errcode = 'check_violation';
  end if;

  delete from circuit_destinations where circuit_id = p_circuit_id;

  -- Order comes from the list's own order: a reorder is one intent, not a series of moves.
  insert into circuit_destinations (circuit_id, destination_id, sort_order)
  select p_circuit_id, member.id, (member.position - 1)::integer
    from unnest(v_ids) with ordinality as member(id, position);

  get diagnostics v_count = row_count;

  insert into audit_log (action, actor_user_id, entity_table, entity_id, after)
  values ('circuit_destinations_set', (select auth.uid()), 'circuits', p_circuit_id,
          jsonb_build_object('destination_ids', to_jsonb(v_ids)));

  return v_count;
end;
$$;

comment on function set_circuit_destinations(uuid, uuid[]) is
  'Replaces a circuit''s ordered destinations in one transaction for the roles that may edit circuits; audited (0051).';

revoke all on function set_circuit_destinations(uuid, uuid[]) from public, anon;
grant execute on function set_circuit_destinations(uuid, uuid[]) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- What a place is connected to
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Experiences at a place, routes that stop there, and facilities within 500 m of it.
 *
 * SECURITY INVOKER: it reads under the caller's own RLS, which gives Ops every draft and
 * travelers nothing — and it refuses travelers outright so an empty answer never looks like
 * "not connected". A facility is a place, so nearness is geographic, as on Live's chips.
 */
create or replace function ops_place_connections(p_place_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_location geography;
begin
  if not is_ops() then
    raise exception 'Only Ops can see a place''s connections' using errcode = 'insufficient_privilege';
  end if;

  select p.location into v_location from places p where p.id = p_place_id and p.deleted_at is null;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'experiences', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'label', e.label, 'status', e.status)
                       order by e.label)
        from (select x.id, x.status, coalesce(nullif(btrim(x.name_i18n ->> 'en'), ''), x.slug) as label
                from experiences x
               where x.place_id = p_place_id and x.deleted_at is null) e), '[]'::jsonb),

    'routes', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'status', r.status,
                                          'stop', r.stop)
                       order by r.label)
        from (select x.id, x.status, rp.sort_order + 1 as stop,
                     coalesce(nullif(btrim(x.name_i18n ->> 'en'), ''), x.slug) as label
                from route_places rp
                join routes x on x.id = rp.route_id
               where rp.place_id = p_place_id and x.deleted_at is null) r), '[]'::jsonb),

    'facilities', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'status', f.status,
                                          'subtype', f.facility_subtype,
                                          'distance_m', f.distance_m)
                       order by f.distance_m, f.label)
        from (select x.id, x.status, x.facility_subtype,
                     coalesce(nullif(btrim(x.name_i18n ->> 'en'), ''), x.slug) as label,
                     round(st_distance(x.location, v_location))::integer as distance_m
                from places x
               where v_location is not null
                 and x.location is not null
                 and x.place_type = 'facility'
                 and x.id <> p_place_id
                 and x.deleted_at is null
                 and st_dwithin(x.location, v_location, 500)
               order by st_distance(x.location, v_location)
               limit 20) f), '[]'::jsonb)
  );
end;
$$;

revoke all on function ops_place_connections(uuid) from public, anon;
grant execute on function ops_place_connections(uuid) to authenticated;
