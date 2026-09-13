-- ══════════════════════════════════════════════════════════════════════════════
-- 0042 · Ops permissions: what a screen offers a role, the database lets that role do
--
-- An audit walked every Ops action against the policies in 0008 and found actions that
-- were offered to a role, refused by RLS, and — because RLS refuses an UPDATE or DELETE by
-- matching no rows rather than by raising — reported as done. Each fix below keeps RLS the
-- primary control (AUTHORIZATION_MODEL "Enforcement layers") and widens nothing beyond
-- the permission map and PRD F18's role list:
--
--   1. Replacing a route's stops is ONE edit to a route. As a client-side delete + insert
--      it needed the admin-only hard delete, so for everyone else the delete matched nothing
--      and the insert duplicated every stop. `set_route_stops` does both atomically for the
--      roles that may edit a route (the routes UPDATE policy), and audits it.
--   2. Removing an availability rule or a transport connection is offered to editors; the
--      hard delete was admin-only and silently removed nothing. `delete_knowledge_row`
--      deletes one row of those two tables for editor/admin, closes its trust records and
--      open tasks, and writes the audit row the version trigger cannot (it has no DELETE).
--   3. Archiving media is a soft delete. The only SELECT policy hid archived rows, so the
--      updated row failed the policy check. Media roles can now read the library they
--      manage, archived rows included.
--   4. Attaching media is the media role's job (permission map "Media: media"), but
--      `entity_media` took writes only from the knowledge drafters. Media roles may now
--      insert and update attachments.
--   5. Returning an item from review to draft is the reviewer's reject (PRD F18 Review:
--      "reject with reason"). Reviewers hold no UPDATE on knowledge tables and must not
--      gain one, so `return_to_draft` moves only `in_review → draft`, only on the eight
--      publishable tables.
--   6. Trust statuses: PRD F18 has researchers create drafts, reviewers accept
--      (→ human_reviewed), verifiers verify (→ verified). RLS let any writer set any status,
--      and did not let researchers write at all. Researchers may now write only
--      `unverified` / `ai_extracted` records, and a trigger enforces the per-status role
--      table on every status change or evidence change made by a signed-in user.
--      Service-role jobs (no auth.uid()) and derived columns are untouched.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Route stops, atomically ──────────────────────────────────────────────────────────

create or replace function set_route_stops(p_route_id uuid, p_stops jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not has_any_role('researcher', 'editor', 'approver', 'admin') then
    raise exception 'not allowed to edit routes' using errcode = '42501';
  end if;

  if jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'stops must be a list' using errcode = '22023';
  end if;

  if not exists (select 1 from routes where id = p_route_id and deleted_at is null) then
    raise exception 'route not found' using errcode = 'P0002';
  end if;

  delete from route_places where route_id = p_route_id;

  -- Order comes from the list's own order: a reorder is one intent, not a series of moves.
  insert into route_places (route_id, place_id, sort_order, is_rest_point)
  select p_route_id,
         (stop.value ->> 'place_id')::uuid,
         (stop.position - 1)::integer,
         coalesce((stop.value ->> 'is_rest_point')::boolean, false)
  from jsonb_array_elements(p_stops) with ordinality as stop(value, position);

  get diagnostics v_count = row_count;

  insert into audit_log (action, actor_user_id, entity_table, entity_id, after)
  values ('route_stops_set', (select auth.uid()), 'routes', p_route_id,
          jsonb_build_object('stops', p_stops));

  return v_count;
end;
$$;

comment on function set_route_stops(uuid, jsonb) is
  'Replaces a route''s stops in one transaction for the roles that may edit routes; audited (0042).';

revoke all on function set_route_stops(uuid, jsonb) from public, anon;
grant execute on function set_route_stops(uuid, jsonb) to authenticated;

-- ── 2. Removing a rule or a connection ──────────────────────────────────────────────────

create or replace function delete_knowledge_row(p_table text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  if p_table not in ('availability_rules', 'transport_connections') then
    raise exception 'that table does not allow removal' using errcode = '22023';
  end if;

  if not has_any_role('editor', 'admin') then
    raise exception 'not allowed to remove this' using errcode = '42501';
  end if;

  execute format('delete from %I where id = $1 returning to_jsonb(%I.*)', p_table, p_table)
    into v_before
    using p_id;

  if v_before is null then
    return false;
  end if;

  -- What it was trusted for goes with it; an open task about a row that no longer exists
  -- is work nobody can do.
  delete from trust_records where entity_table = p_table and entity_id = p_id;
  update review_tasks
     set status = 'done', completed_at = now(), completed_by = (select auth.uid())
   where entity_table = p_table and entity_id = p_id and status in ('open', 'in_progress');

  insert into audit_log (action, actor_user_id, entity_table, entity_id, before)
  values ('delete', (select auth.uid()), p_table, p_id, v_before);

  return true;
end;
$$;

comment on function delete_knowledge_row(text, uuid) is
  'Editor/admin removal of one availability rule or transport connection, with its trust records; audited (0042).';

revoke all on function delete_knowledge_row(text, uuid) from public, anon;
grant execute on function delete_knowledge_row(text, uuid) to authenticated;

-- ── 3 & 4. The media library and attachments ────────────────────────────────────────────

create policy media_assets_ops_read on media_assets
  for select to authenticated
  using (has_any_role('media', 'editor', 'admin'));

create policy entity_media_media_insert on entity_media
  for insert to authenticated
  with check (has_any_role('media', 'editor', 'admin'));

create policy entity_media_media_update on entity_media
  for update to authenticated
  using (has_any_role('media', 'editor', 'admin'))
  with check (has_any_role('media', 'editor', 'admin'));

-- ── 5. A reviewer's reject ──────────────────────────────────────────────────────────────

create or replace function return_to_draft(p_table text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved integer;
begin
  if p_table not in ('destinations', 'places', 'experiences', 'routes',
                     'transport_connections', 'guidance_blocks', 'phrases', 'advisories') then
    raise exception 'that table has no review' using errcode = '22023';
  end if;

  if not has_any_role('reviewer', 'editor', 'approver', 'admin') then
    raise exception 'not allowed to return this to draft' using errcode = '42501';
  end if;

  -- Only out of review. Unpublishing is not a reviewer's decision.
  execute format('update %I set status = ''draft'' where id = $1 and status = ''in_review''', p_table)
    using p_id;
  get diagnostics v_moved = row_count;

  return v_moved > 0;
end;
$$;

comment on function return_to_draft(text, uuid) is
  'PRD F18 reject: in_review → draft for reviewer/editor/approver/admin, without granting reviewers UPDATE (0042).';

revoke all on function return_to_draft(text, uuid) from public, anon;
grant execute on function return_to_draft(text, uuid) to authenticated;

-- ── 6. Trust statuses by role ───────────────────────────────────────────────────────────

create policy trust_records_researcher_insert on trust_records
  for insert to authenticated
  with check (has_role('researcher') and verification_status in ('unverified', 'ai_extracted'));

create policy trust_records_researcher_update on trust_records
  for update to authenticated
  using (has_role('researcher') and verification_status in ('unverified', 'ai_extracted'))
  with check (has_role('researcher') and verification_status in ('unverified', 'ai_extracted'));

create or replace function trust_status_roles(p_status verification_status_enum)
returns ops_role_enum[]
language sql
immutable
set search_path = public
as $$
  -- PRD F18: researchers draft, reviewers accept, verifiers verify; editors and admins
  -- may do the first three. Only a verifier or an admin can make a field `verified`.
  select case p_status::text
    when 'unverified'     then array['researcher', 'reviewer', 'verifier', 'editor', 'admin']
    when 'ai_extracted'   then array['researcher', 'editor', 'admin']
    when 'human_reviewed' then array['reviewer', 'verifier', 'editor', 'admin']
    when 'verified'       then array['verifier', 'admin']
    when 'disputed'       then array['reviewer', 'verifier', 'editor', 'admin']
    else array['admin']
  end::ops_role_enum[];
$$;

create or replace function enforce_trust_status_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Jobs and the ingestion pipeline run as the service role, with no user.
  if (select auth.uid()) is null then
    return new;
  end if;

  -- Derived and flag columns (freshness, confidence, report_downgrade, conflict_flag) move
  -- without a person deciding anything. What needs the right role is the claim itself:
  -- its status, and the evidence behind it.
  if tg_op = 'UPDATE'
     and new.verification_status is not distinct from old.verification_status
     and new.source_id is not distinct from old.source_id
     and new.evidence_url is not distinct from old.evidence_url
     and new.evidence_excerpt is not distinct from old.evidence_excerpt
     and new.verified_at is not distinct from old.verified_at
     and new.valid_until is not distinct from old.valid_until then
    return new;
  end if;

  if not has_any_role(variadic trust_status_roles(new.verification_status)) then
    raise exception 'this role cannot set a field to %', new.verification_status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- A trigger function needs no EXECUTE grant to fire; nobody should be able to call it.
revoke all on function enforce_trust_status_role() from public, anon, authenticated;

create trigger trust_records_enforce_status_role
  before insert or update on trust_records
  for each row execute function enforce_trust_status_role();
