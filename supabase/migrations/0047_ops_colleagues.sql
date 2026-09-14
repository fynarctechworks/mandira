-- ══════════════════════════════════════════════════════════════════════════════
-- 0047 · Who an Ops record can be assigned to
--
-- PRD F17 gives every source an owner — the person who keeps it checked. `sources` has had
-- `owner_user_id` since 0002, but nothing could offer a list of people to choose from:
-- `ops_team()` (0032) is the admin's team screen, with emails, roles and sign-in times, and
-- a researcher registering a source is not an admin.
--
-- `ops_colleagues()` is the narrow version any Ops user may call: each Ops user's id and a
-- name to show — their display name, else their email — and nothing else. Travelers are
-- never listed and cannot call it.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function ops_colleagues()
returns table (user_id uuid, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_ops() then
    raise exception 'Only Ops can see who works in Ops' using errcode = 'insufficient_privilege';
  end if;

  return query
    select distinct on (u.id) u.id, coalesce(nullif(btrim(p.display_name), ''), u.email::text)
      from user_roles r
      join auth.users u on u.id = r.user_id
      left join profiles p on p.id = u.id
     order by u.id;
end;
$$;

comment on function ops_colleagues() is
  'Ops users as an owner picker: id and a display name only, for any Ops user (0047).';

revoke all on function ops_colleagues() from public, anon;
grant execute on function ops_colleagues() to authenticated;
