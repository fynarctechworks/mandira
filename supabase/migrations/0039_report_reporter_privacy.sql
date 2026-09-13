-- ══════════════════════════════════════════════════════════════════════════════
-- 0039 · Who reported something stays out of Ops' hands (PRD §10, PRD-REPT-003, D-174)
--
-- Two leaks of `user_reports.user_id`, found while building report photos:
--
--   1. Resolving a report asked for `user_id` back so the Server Action could queue the
--      reporter's "we checked that" notice. 0030 withholds that column from every client role,
--      so the resolve failed outright; and had it worked, Ops code would have held the id.
--   2. `audit_ops_change` (0029) copies whole rows into `audit_log`, which admins and approvers
--      read — so every triage or resolution wrote the reporter's account id where Ops can see it.
--
-- The notice is now queued by a role-checked SECURITY DEFINER function that reads the id
-- inside the database and returns only whether it queued anything. The audit trigger drops
-- `user_id` from report rows, and the rows already written are scrubbed.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. The notice ───────────────────────────────────────────────────────────────────────

create or replace function notify_report_resolution(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid;
  v_status   text;
  v_notified boolean;
  v_outcome  text;
begin
  -- The same roles that may resolve a report (AUTHORIZATION_MODEL).
  if not has_any_role('admin', 'editor', 'verifier', 'support') then
    raise exception 'Only the reports team can close the loop on a report.'
      using errcode = '42501';
  end if;

  select user_id, status::text, notified_user
  into v_user, v_status, v_notified
  from user_reports
  where id = p_report_id
  for update;

  -- Nothing to tell: unknown, not yet resolved, already told, or filed without an account.
  if not found or v_status not like 'resolved\_%' or v_notified or v_user is null then
    return false;
  end if;

  v_outcome := case v_status
    when 'resolved_updated' then 'updated'
    when 'resolved_confirmed_correct' then 'confirmed'
    else 'unverified'
  end;

  /*
   * In the app always; by email only if the traveler opted in — the sender decides that at
   * send time from their own switches (D-171). Keys, never sentences: the language is the
   * traveler's when it is sent, not the operator's when they clicked.
   */
  insert into notifications
    (user_id, notification_type, channel, status, scheduled_for, title_i18n, body_i18n, payload)
  select v_user, 'report_resolved', channel, 'scheduled', now(),
         '{"key": "notify.report_resolved.title"}'::jsonb,
         '{"key": "notify.report_resolved.body"}'::jsonb,
         jsonb_build_object('outcome', v_outcome)
  from unnest(array['inapp', 'email']) as channel;

  update user_reports set notified_user = true where id = p_report_id;

  return true;
end;
$$;

comment on function notify_report_resolution(uuid) is
  'Queues a resolved report''s notice to its reporter without exposing who that is (D-174).';

revoke all on function notify_report_resolution(uuid) from public, anon;
grant execute on function notify_report_resolution(uuid) to authenticated;

-- ── 2. The audit trail ──────────────────────────────────────────────────────────────────

create or replace function audit_redact(p_table text, p_row jsonb)
returns jsonb
language sql
immutable
as $$
  select case when p_table = 'user_reports' then p_row - 'user_id' else p_row end;
$$;

comment on function audit_redact(text, jsonb) is
  'Removes columns identifying a traveler before a row is written to audit_log (D-174).';

revoke all on function audit_redact(text, jsonb) from public, anon, authenticated;

create or replace function audit_ops_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb := audit_redact(tg_table_name, to_jsonb(coalesce(new, old)));
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
    case when tg_op in ('UPDATE', 'DELETE') and not lite
         then audit_redact(tg_table_name, to_jsonb(old)) end,
    case when tg_op in ('INSERT', 'UPDATE') and not lite
         then audit_redact(tg_table_name, to_jsonb(new)) end,
    audit_ip_hash()
  );

  return null;
end;
$$;

comment on function audit_ops_change() is
  'S-3: AFTER row trigger writing audit_log for every Ops-actor mutation, traveler ids redacted (D-174). Arg ''lite'' omits bodies.';

revoke all on function audit_ops_change() from public, anon, authenticated;

-- What is already in the trail loses the id too.
update audit_log
set before = before - 'user_id',
    after  = after - 'user_id'
where entity_table = 'user_reports'
  and (before ? 'user_id' or after ? 'user_id');
