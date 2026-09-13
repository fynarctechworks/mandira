-- 0033_traveler_account.sql — a traveler's own data: take it with you, delete it, reorder a day.
--
-- PRD-PRIV-003/004 and DPDP give a traveler the right to a copy of their data and to erasure.
-- The erasure half already existed as a job (`purge_deleted_accounts`, 0013) with no way for a
-- traveler to start it. These are the doors, each scoped to the signed-in account.

-- ══════════════════════════════════════════════════════════════════════════════
-- Deletion: requested now, carried out by the daily job after 30 days
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function request_account_deletion()
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_requested timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in to delete your account' using errcode = 'insufficient_privilege';
  end if;

  update profiles
     set deleted_at = coalesce(deleted_at, now())
   where id = v_user
  returning deleted_at into v_requested;

  if v_requested is null then
    raise exception 'No profile for this account' using errcode = 'no_data_found';
  end if;

  -- The purge job's grace period (0013); returned so the app can say exactly when.
  return v_requested + interval '30 days';
end;
$$;

comment on function request_account_deletion() is
  'Marks the signed-in account for erasure; purge_deleted_accounts removes it after 30 days.';

create or replace function cancel_account_deletion()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to keep your account' using errcode = 'insufficient_privilege';
  end if;

  update profiles set deleted_at = null where id = (select auth.uid());
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- Export: everything held about the signed-in traveler, in one document
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * SECURITY DEFINER with every subquery filtered on auth.uid(), rather than INVOKER under RLS.
 *
 * Under RLS an Ops user exporting their own data would also receive every report and role
 * row their Ops policies let them read — someone else's data inside "your data". Filtering
 * on the account explicitly answers the question actually asked. Push subscription keys and
 * share tokens are omitted: they are credentials, not information about the person.
 */
create or replace function export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select (select auth.uid()) as id)
  select case when (select id from me) is null then null else jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                  from auth.users u where u.id = (select id from me)),
    'profile', (select to_jsonb(p) from profiles p where p.id = (select id from me)),
    'travelers', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
        from traveler_profiles t where t.owner_user_id = (select id from me)), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'journey', to_jsonb(j),
        'destinations', coalesce((select jsonb_agg(to_jsonb(d) order by d.sort_order)
                                    from journey_destinations d where d.journey_id = j.id), '[]'::jsonb),
        'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.day_index, i.sort_order)
                             from journey_items i where i.journey_id = j.id), '[]'::jsonb),
        'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
                             from journey_item_notes n
                             join journey_items i on i.id = n.item_id
                            where i.journey_id = j.id), '[]'::jsonb),
        'prepare_tasks', coalesce((select jsonb_agg(to_jsonb(pt) order by pt.sort_order)
                                     from prepare_tasks pt where pt.journey_id = j.id), '[]'::jsonb),
        'changes', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                               from journey_change_events c where c.journey_id = j.id), '[]'::jsonb),
        'record', (select to_jsonb(r) from journey_records r where r.journey_id = j.id),
        'shares', coalesce((select jsonb_agg(jsonb_build_object(
                                     'created_at', s.created_at, 'expires_at', s.expires_at))
                              from journey_shares s where s.journey_id = j.id), '[]'::jsonb)
      ) order by j.created_at)
        from journeys j where j.owner_user_id = (select id from me)), '[]'::jsonb),
    'saved_places', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
        from saved_places s where s.user_id = (select id from me)), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
        from notifications n where n.user_id = (select id from me)), '[]'::jsonb),
    'push_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_agent', ns.user_agent, 'created_at', ns.created_at,
               'last_success_at', ns.last_success_at) order by ns.created_at)
        from notification_subscriptions ns where ns.user_id = (select id from me)), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'report_type', r.report_type, 'entity_table', r.entity_table,
               'entity_id', r.entity_id, 'field_name', r.field_name,
               'description', r.description, 'status', r.status,
               'resolution_note', r.resolution_note, 'created_at', r.created_at)
             order by r.created_at)
        from user_reports r where r.user_id = (select id from me)), '[]'::jsonb),
    'personalization_signals', coalesce((
      select jsonb_agg(to_jsonb(ps) order by ps.created_at)
        from personalization_signals ps where ps.user_id = (select id from me)), '[]'::jsonb)
  ) end;
$$;

comment on function export_my_data() is
  'Everything held about the signed-in traveler, as one JSON document (PRD-PRIV-003, DPDP).';

-- ══════════════════════════════════════════════════════════════════════════════
-- Reordering a day, in one statement
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * The new order must name every item of the day exactly once. A partial list would leave two
 * items sharing a position, and the scheduler would then pick between them arbitrarily.
 * INVOKER: the traveler's own RLS decides which journey they may touch; another traveler's
 * journey simply has no rows, so the count check refuses it.
 */
create or replace function reorder_journey_items(
  p_journey_id uuid,
  p_day_index int,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected int := coalesce(array_length(p_item_ids, 1), 0);
  v_updated int;
begin
  if (select count(*) from journey_items
       where journey_id = p_journey_id and day_index = p_day_index and deleted_at is null)
     <> v_expected then
    raise exception 'The new order must list every item of that day exactly once'
      using errcode = 'invalid_parameter_value';
  end if;

  update journey_items i
     set sort_order = o.position - 1
    from unnest(p_item_ids) with ordinality as o(id, position)
   where i.id = o.id
     and i.journey_id = p_journey_id
     and i.day_index = p_day_index
     and i.deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'The new order must list every item of that day exactly once'
      using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke all on function request_account_deletion() from public, anon;
revoke all on function cancel_account_deletion() from public, anon;
revoke all on function export_my_data() from public, anon;
revoke all on function reorder_journey_items(uuid, int, uuid[]) from public, anon;

grant execute on function request_account_deletion() to authenticated;
grant execute on function cancel_account_deletion() to authenticated;
grant execute on function export_my_data() to authenticated;
grant execute on function reorder_journey_items(uuid, int, uuid[]) to authenticated;
