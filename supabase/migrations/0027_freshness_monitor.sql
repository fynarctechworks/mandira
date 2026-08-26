-- 0027_freshness_monitor.sql — the queue that stops published knowledge rotting (B-030).
--
-- PRD F18's Freshness monitor: "all published critical fields by freshness; filters: stale,
-- aging, expiring within 30 days, low confidence, conflict. Bulk 'assign re-verification'."
--
-- WHY THIS IS SQL AND NOT A QUERY IN THE PAGE. Three of the rules it depends on already
-- live here and must not be restated anywhere else:
--
--   * `critical_fields()` — the TRD §4.4 list, kept in step with the publish views by a
--     pgTAP assertion that parses the view definitions. A second copy in TypeScript is a
--     second thing that can drift, and drifting means a field quietly stops being watched.
--   * `is_entity_published()` — a draft's stale field is nobody's problem yet, and filling
--     the queue with drafts buries the ones that are.
--   * `derive_freshness()` — freshness is a function of the CLOCK, so "expiring within 30
--     days" has to be computed against the same definition the nightly job uses.
--
-- Additive: one function, no table or policy changes.

/**
 * Published critical fields, worst first.
 *
 * `security definer` for the same narrow reason `is_entity_published` is: resolving whether
 * an entity is published means reading the knowledge tables from inside a function that Ops
 * calls, and the alternative is a view whose permissions are harder to reason about than
 * one explicit role check. The check is here, at the top, and it is the only authorization
 * this function has.
 *
 * Returns rows, never a verdict. Which of these an operator should look at first is a
 * judgement about the destination and the season, and this is not the layer to make it.
 */
create or replace function freshness_rows(
  p_filter         text default 'all',
  p_destination_id uuid default null,
  p_limit          int default 200
)
returns table (
  trust_id            uuid,
  entity_table        text,
  entity_id           uuid,
  field_name          text,
  entity_label        text,
  destination_id      uuid,
  verification_status verification_status_enum,
  freshness           freshness_enum,
  confidence          confidence_enum,
  conflict_flag       boolean,
  report_downgrade    boolean,
  verified_at         timestamptz,
  valid_until         date,
  source_name         text,
  source_tier         source_tier_enum,
  has_open_task       boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_ops() then
    raise exception 'not permitted to read the freshness monitor' using errcode = '42501';
  end if;

  if p_filter not in ('all', 'stale', 'aging', 'expiring30', 'low', 'conflict') then
    raise exception 'unknown filter %', p_filter using errcode = '22023';
  end if;

  return query
  with named as (
    -- One row per entity that can carry a critical field, with something an operator can
    -- read. English rather than the request's locale on purpose: Ops works in English
    -- (PRD §12.7 governs the traveler's voice), and a queue whose rows are named in a
    -- language the operator does not read is a queue nobody works through.
    select p.id, 'places'::text as tbl, p.name_i18n ->> 'en' as label, p.destination_id
      from places p
    union all
    select e.id, 'experiences', e.name_i18n ->> 'en', e.destination_id from experiences e
    union all
    select r.id, 'routes', r.name_i18n ->> 'en', r.destination_id from routes r
    union all
    -- A transport connection has no name column: it IS a mode between two places, so
    -- that is what an operator is shown.
    select t.id, 'transport_connections',
           coalesce(t.operator || ' ', '') || t.mode::text ||
             coalesce(' — ' || (fp.name_i18n ->> 'en'), '') ||
             coalesce(' to ' || (tp.name_i18n ->> 'en'), ''),
           t.destination_id
      from transport_connections t
      left join places fp on fp.id = t.from_place_id
      left join places tp on tp.id = t.to_place_id
    union all
    -- An availability rule has no name of its own; it is named by what it is about.
    select a.id, 'availability_rules', ex.name_i18n ->> 'en', ex.destination_id
      from availability_rules a
      join experiences ex on ex.id = a.experience_id
  )
  select
    tr.id,
    tr.entity_table,
    tr.entity_id,
    tr.field_name,
    coalesce(n.label, '(unnamed)'),
    n.destination_id,
    tr.verification_status,
    tr.freshness,
    tr.confidence,
    tr.conflict_flag,
    tr.report_downgrade,
    tr.verified_at,
    tr.valid_until,
    s.name,
    s.tier,
    exists (
      select 1 from review_tasks rt
      where rt.task_type in ('reverify', 'verify')
        and rt.entity_table = tr.entity_table
        and rt.entity_id = tr.entity_id
        and rt.field_name is not distinct from tr.field_name
        and rt.status in ('open', 'in_progress')
    )
  from trust_records tr
  join named n on n.id = tr.entity_id and n.tbl = tr.entity_table
  left join sources s on s.id = tr.source_id
  where
    -- Critical fields only. A named field on the list, or a whole-entity record on a table
    -- whose criticality is total (availability rules, TRD §4.4).
    (
      tr.field_name = any (coalesce(critical_fields(tr.entity_table), array[]::text[]))
      or (tr.field_name is null and tr.entity_table = 'availability_rules')
    )
    and is_entity_published(tr.entity_table, tr.entity_id)
    and (p_destination_id is null or n.destination_id = p_destination_id)
    and case p_filter
          when 'stale'      then tr.freshness = 'stale'
          when 'aging'      then tr.freshness = 'aging'
          -- Expiring is about `valid_until` specifically, not about age. A source that
          -- says "correct until 30 September" stops being correct on 1 October however
          -- recently somebody read it.
          when 'expiring30' then tr.valid_until is not null
                                 and tr.valid_until >= current_date
                                 and tr.valid_until <= current_date + 30
          when 'low'        then tr.confidence = 'low'
          when 'conflict'   then tr.conflict_flag
          else true
        end
  order by
    -- Worst first, and within that the oldest. A monitor sorted any other way is one where
    -- the field nobody has checked since March is on page four.
    case tr.freshness when 'stale' then 0 when 'aging' then 1 else 2 end,
    tr.conflict_flag desc,
    case tr.confidence when 'low' then 0 when 'medium' then 1 else 2 end,
    tr.verified_at nulls first
  limit greatest(1, least(p_limit, 500));
end;
$$;

comment on function freshness_rows is
  'PRD-OPS-WF-006. Published critical fields with their trust state, worst first. Reads '
  'critical_fields() and is_entity_published() rather than restating either.';

revoke all on function freshness_rows(text, uuid, int) from public;
grant execute on function freshness_rows(text, uuid, int) to authenticated;

/**
 * Bulk "assign re-verification" (PRD F18).
 *
 * One task per field, and never a second while one is open — a monitor that grows a
 * duplicate every time somebody taps the button is a monitor whose numbers stop meaning
 * anything. The same guard the nightly reverify job uses (0013).
 *
 * Assigning is a narrower act than looking: `verifier`, `editor` or `admin`. A researcher
 * can see what is going stale without being able to put it on somebody's desk.
 */
create or replace function assign_reverification(
  p_trust_ids  uuid[],
  p_assignee   uuid default null,
  p_note       text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int;
begin
  if not has_any_role('verifier', 'editor', 'admin') then
    raise exception 'not permitted to assign re-verification' using errcode = '42501';
  end if;

  insert into review_tasks
    (task_type, entity_table, entity_id, field_name, related_id, assigned_to, priority, notes)
  select
    'reverify',
    tr.entity_table,
    tr.entity_id,
    tr.field_name,
    tr.id,
    p_assignee,
    -- Stale beats aging, and anything conflicted beats both: a field two sources disagree
    -- about is being shown to travelers right now with a confidence it has not earned.
    case when tr.conflict_flag then 1 when tr.freshness = 'stale' then 1 else 2 end,
    coalesce(p_note, 'Assigned from the freshness monitor.')
  from trust_records tr
  where tr.id = any (p_trust_ids)
    and not exists (
      select 1 from review_tasks rt
      where rt.task_type in ('reverify', 'verify')
        and rt.entity_table = tr.entity_table
        and rt.entity_id = tr.entity_id
        and rt.field_name is not distinct from tr.field_name
        and rt.status in ('open', 'in_progress')
    );

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function assign_reverification is
  'PRD-OPS-WF-006 bulk assignment. One open task per field, never two.';

revoke all on function assign_reverification(uuid[], uuid, text) from public;
grant execute on function assign_reverification(uuid[], uuid, text) to authenticated;
