-- 0048_product_outcomes.sql — PRD F20 product signals derived from journeys (O22).
--
-- `product_signals()` (0032) counts analytics events. PRD F20 asks for more than event
-- counts: journeys created, the share with a PROTECTED item, health at departure, Change
-- Cards shown and accepted, Live use during journeys, offline use, and reports per 1,000
-- journey-days. Most of those are facts already in the journey tables, so they are counted
-- there — in one aggregate function, never rows, and never from `traveler_profiles`.

-- ══════════════════════════════════════════════════════════════════════════════
-- Health at departure
-- ══════════════════════════════════════════════════════════════════════════════

alter table journeys add column health_at_departure health_state_enum;

comment on column journeys.health_at_departure is
  'Journey Health at the moment the journey became active, kept once set (PRD F20, 0048).';

/*
 * `health_state` is the LATEST engine output, so by the time a journey is done it says how
 * the last day went, not how the plan looked when the traveler set off. The departure value
 * is captured once, when status first becomes `active` — by `roll_journey_statuses()` or by
 * the traveler's "Start today" — and every other write keeps the stored value. A client
 * therefore cannot set or change it: the owner's update grant on `journeys` is table-wide.
 */
create or replace function journeys_capture_departure_health()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.health_at_departure := case when new.status = 'active' then new.health_state end;
  elsif new.status = 'active' and old.status is distinct from 'active'
        and old.health_at_departure is null then
    new.health_at_departure := new.health_state;
  else
    new.health_at_departure := old.health_at_departure;
  end if;
  return new;
end;
$$;

revoke all on function journeys_capture_departure_health() from public, anon, authenticated;

create trigger journeys_capture_departure_health
  before insert or update on journeys
  for each row execute function journeys_capture_departure_health();

-- ══════════════════════════════════════════════════════════════════════════════
-- O22 · Product outcomes
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * PRD F20's product signals, counted over the window. Every value is a count or a
 * distribution; no id, title, date or free text leaves this function.
 *
 * Journey-days are the days of `active` and `completed` journeys that fall inside the window
 * and are not in the future, each journey counted in its own timezone. They are the
 * denominator for Live use and for the report rate (PRD §7).
 */
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
