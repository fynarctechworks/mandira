-- 0052_leave_by_acted.sql — PRD §7: "Leave-by reminders acted on (Done within 20 min of plan)".
--
-- The last F20 signal that was still guesswork. It needs no new event: a leave-by
-- notification records the item it is about (`payload.params.itemId`, engine `notify.ts`),
-- and the item records when it actually started. A reminder counts as acted on when its item
-- started within twenty minutes of the time the plan gave it — early or late.
--
-- Everything else in `product_outcomes()` is unchanged; the whole function is restated because
-- that is how a SQL function is edited.

create or replace function product_outcomes(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180));
  v_journey_days bigint;
begin
  if not has_any_role('admin', 'editor', 'approver') then
    raise exception 'Product signals need an admin, editor or approver role'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(greatest(0,
           least(coalesce(j.end_date, j.start_date), (now() at time zone j.timezone)::date)
           - greatest(j.start_date, (v_since at time zone j.timezone)::date) + 1)), 0)
    into v_journey_days
    from journeys j
   where j.deleted_at is null
     and j.status in ('active', 'completed')
     and j.start_date is not null;

  return jsonb_build_object(
    'since', v_since,

    'journeys', (
      select jsonb_build_object(
               'created', count(*),
               'with_protected', count(*) filter (where s.has_protected),
               'with_protected_and_fixed', count(*) filter (where s.has_protected and s.has_fixed))
        from (
          select exists (select 1 from journey_items i
                          where i.journey_id = j.id and i.deleted_at is null
                            and i.tier = 'protected') as has_protected,
                 exists (select 1 from journey_items i
                          where i.journey_id = j.id and i.deleted_at is null
                            and i.tier = 'fixed') as has_fixed
            from journeys j
           where j.deleted_at is null and j.created_at >= v_since
        ) s),

    -- Departures in the window: journeys whose first day falls inside it.
    'health_at_departure', coalesce((
      select jsonb_object_agg(h.state, h.n)
        from (
          select j.health_at_departure::text as state, count(*) as n
            from journeys j
           where j.deleted_at is null
             and j.health_at_departure is not null
             and j.start_date >= (v_since at time zone j.timezone)::date
           group by 1
        ) h), '{}'::jsonb),

    -- PRD F6: a NULL choice with a decision time is "Keep as is", which is an outcome too.
    'change_cards', (
      select jsonb_build_object(
               'shown', count(*),
               'accepted', count(*) filter (where e.chosen_option_index is not null),
               'kept_as_is', count(*) filter (where e.decided_at is not null
                                                and e.chosen_option_index is null),
               'accepted_within_2_min', count(*) filter (
                 where e.chosen_option_index is not null
                   and e.decided_at <= e.created_at + interval '2 minutes'))
        from journey_change_events e
       where e.change_card is not null and e.created_at >= v_since),

    /*
     * PRD §7: leave-by reminders acted on. "Acted on" is the item starting within twenty
     * minutes of its planned time — a reminder that reached someone who then left on time.
     * A reminder for an item since deleted counts as sent and not acted on, which is honest:
     * we interrupted somebody and cannot show it helped.
     */
    'leave_by', (
      select jsonb_build_object(
               'sent', count(*),
               'acted', count(*) filter (
                 where i.actual_start_at is not null
                   and i.planned_start_at is not null
                   and abs(extract(epoch from (i.actual_start_at - i.planned_start_at))) <= 20 * 60))
        from notifications n
        left join journey_items i
          on i.id = nullif(n.payload -> 'params' ->> 'itemId', '')::uuid
         and i.deleted_at is null
       where n.notification_type = 'leave_by'
         and n.status = 'sent'
         and n.sent_at >= v_since),

    'live', jsonb_build_object(
      'journey_days', v_journey_days,
      -- A journey-day with Live opened at least once, in India's calendar like 0032's daily series.
      'journey_days_with_live', (
        select count(distinct (a.journey_id, (a.created_at at time zone 'Asia/Kolkata')::date))
          from analytics_events a
         where a.event_name = 'live_opened' and a.journey_id is not null
           and a.created_at >= v_since),
      'opened', (select count(*) from analytics_events a
                  where a.event_name = 'live_opened' and a.created_at >= v_since),
      'opened_offline', (select count(*) from analytics_events a
                          where a.event_name = 'live_opened' and a.is_offline
                            and a.created_at >= v_since)),

    'offline', jsonb_build_object(
      'events', (select count(*) from analytics_events a
                  where a.is_offline and a.created_at >= v_since),
      'renders', (select count(*) from analytics_events a
                   where a.event_name = 'offline_render' and a.created_at >= v_since)),

    'reports', jsonb_build_object(
      'total', (select count(*) from user_reports r where r.created_at >= v_since),
      -- "Valid" per PRD §7: the report led to a knowledge update.
      'valid', (select count(*) from user_reports r
                 where r.created_at >= v_since and r.status = 'resolved_updated'),
      'journey_days', v_journey_days)
  );
end;
$$;

revoke all on function product_outcomes(int) from public, anon;
grant execute on function product_outcomes(int) to authenticated;
