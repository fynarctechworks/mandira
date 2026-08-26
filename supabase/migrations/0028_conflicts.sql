-- 0028_conflicts.sql — recording and resolving a disagreement between sources (B-030).
--
-- PRD F18's Conflicts queue: "shows all competing values with tiers and dates. Actions:
-- choose winner (with reason), mark both valid with context (e.g. seasonal), escalate.
-- Resolution clears `conflict_flag`."
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY THE RAISE IS MANUAL, AND WHAT THAT IS WAITING ON
-- ══════════════════════════════════════════════════════════════════════════════
--
-- PRD-OPS-SRC-005 wants a Conflict opened automatically "when two sources of tier ≤T3
-- yield different values for the same field". That needs per-source claimed VALUES, and
-- the schema has nowhere to keep them: `trust_records` is unique on
-- (entity_table, entity_id, field_name), so it records the ONE source a field is currently
-- verified against and cannot hold "source B says 18:00" beside source A's 18:30. The only
-- producer of per-source claims is `ai_extractions.proposed_entities`, which needs a key
-- nobody has yet (ACCT-04).
--
-- That is a genuine block, not an unbuilt feature, and it is recorded as OPEN-014 with a
-- recommendation rather than resolved by inventing a claims table the TRD does not
-- describe. What ships here is everything downstream of the raise — which is also what a
-- verifier does today, by hand, when they read two sources and find they disagree.
--
-- Automatic detection calls `open_conflict()` when extraction lands. Nothing about the
-- resolution path changes then.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- THE RULE THAT MATTERS MOST
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Resolving a conflict does NOT edit knowledge. It records which source an operator judged
-- correct and clears the flag; changing the value itself is a separate edit through the
-- publish gate. Same reasoning as the Reports queue (D-127) and the Review queue (D-140):
-- if a queue could publish, then whichever source shouted loudest would become the truth.
--
-- Additive: two functions and an index. No table, column or policy changes.

create index if not exists conflicts_status_entity_idx
  on conflicts (status, entity_table, entity_id);

/**
 * Opens a conflict and marks the field as contested.
 *
 * `conflict_flag` is the load-bearing part. `derive_confidence` (0002) drops any flagged
 * field to LOW, and the published views carry the flag through to the traveler — so this
 * is not merely an Ops bookkeeping entry. A field two sources disagree about stops being
 * shown as confident the moment somebody says so, before anybody resolves anything.
 *
 * Idempotent per field while a conflict is open: a second operator noticing the same
 * disagreement joins the existing one rather than starting a rival.
 */
create or replace function open_conflict(
  p_entity_table text,
  p_entity_id    uuid,
  p_field_name   text,
  p_values       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Verifiers own conflicts (PRD F18's role list); editors and admins can act anywhere.
  if not has_any_role('verifier', 'editor', 'admin') then
    raise exception 'not permitted to open a conflict' using errcode = '42501';
  end if;

  -- A conflict is a disagreement, so it needs at least two things disagreeing. One value
  -- is a correction, and corrections go through the editor and the publish gate.
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) < 2 then
    raise exception 'a conflict needs at least two competing values' using errcode = '23514';
  end if;

  select id into v_id
    from conflicts
   where entity_table = p_entity_table
     and entity_id = p_entity_id
     and field_name is not distinct from p_field_name
     and status = 'open'
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into conflicts (entity_table, entity_id, field_name, values, status)
  values (p_entity_table, p_entity_id, p_field_name, p_values, 'open')
  returning id into v_id;

  -- The traveler-visible half. Nothing else in this function reaches a traveler; this does.
  update trust_records
     set conflict_flag = true
   where entity_table = p_entity_table
     and entity_id = p_entity_id
     and field_name is not distinct from p_field_name;

  -- And somebody has to actually look at it.
  insert into review_tasks (task_type, entity_table, entity_id, field_name, related_id, priority, notes)
  select 'conflict', p_entity_table, p_entity_id, p_field_name, v_id, 1,
         'Sources disagree about this field.'
  where not exists (
    select 1 from review_tasks rt
    where rt.task_type = 'conflict'
      and rt.entity_table = p_entity_table
      and rt.entity_id = p_entity_id
      and rt.field_name is not distinct from p_field_name
      and rt.status in ('open', 'in_progress')
  );

  return v_id;
end;
$$;

comment on function open_conflict is
  'PRD-OPS-SRC-005. Raised by hand until AI extraction can produce per-source claims '
  '(OPEN-014). Sets conflict_flag, which drops the field to low confidence for travelers.';

revoke all on function open_conflict(text, uuid, text, jsonb) from public;
grant execute on function open_conflict(text, uuid, text, jsonb) to authenticated, service_role;

/**
 * Resolves a conflict (PRD-OPS-WF-003).
 *
 * Three outcomes and no fourth, exactly as PRD F18 lists them:
 *
 *   winner      — one source is right. Needs a reason, and the reason is the point: the
 *                 next person to read this field needs to know why T2 beat T1 that time.
 *   both_valid  — both are right, in different circumstances (seasonal timings, a festival
 *                 schedule). The flag CLEARS but the field stays worth a second look, so
 *                 the reason carries the context.
 *   escalated   — nobody here can settle it. A real answer, and it deliberately LEAVES the
 *                 flag set: an unresolved disagreement must keep showing travelers low
 *                 confidence rather than being tidied off a queue.
 *
 * What it never does is change the value. Correcting the fact is a separate edit through
 * the publish gate — if resolving could publish, the loudest source would win by default.
 */
create or replace function resolve_conflict(
  p_id               uuid,
  p_resolution       text,
  p_reason           text,
  p_winner_source_id uuid default null
)
returns conflicts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row conflicts;
begin
  if p_resolution not in ('winner', 'both_valid', 'escalate') then
    raise exception 'unknown resolution %', p_resolution using errcode = '22023';
  end if;

  if not has_any_role('verifier', 'editor', 'admin') then
    raise exception 'not permitted to resolve a conflict' using errcode = '42501';
  end if;

  -- Every outcome needs a reason. A resolved conflict with no reasoning is a field that
  -- looks settled and cannot be re-examined by whoever meets it next.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a resolution needs a reason' using errcode = '23514';
  end if;

  if p_resolution = 'winner' and p_winner_source_id is null then
    raise exception 'choosing a winner means naming the source' using errcode = '23514';
  end if;

  select * into v_row from conflicts where id = p_id for update;
  if not found then
    raise exception 'conflict not found' using errcode = 'P0002';
  end if;

  -- A second tap is a no-op, not a re-resolution (the rule Change Cards follow, D-121).
  if v_row.status <> 'open' then
    return v_row;
  end if;

  update conflicts
     set status = case p_resolution
                    when 'winner'     then 'resolved_winner'
                    when 'both_valid' then 'resolved_both_valid'
                    else 'escalated'
                  end,
         winner_source_id = case when p_resolution = 'winner' then p_winner_source_id end,
         resolution_reason = p_reason,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_id
  returning * into v_row;

  /*
   * The flag clears only when the disagreement is actually settled. Escalating keeps it,
   * because a traveler standing in front of the place deserves "check locally" for as long
   * as we genuinely do not know.
   */
  if p_resolution in ('winner', 'both_valid') then
    update trust_records
       set conflict_flag = false
     where entity_table = v_row.entity_table
       and entity_id = v_row.entity_id
       and field_name is not distinct from v_row.field_name;

    update review_tasks
       set status = 'done', completed_by = auth.uid(), completed_at = now()
     where task_type = 'conflict'
       and related_id = p_id
       and status in ('open', 'in_progress');
  end if;

  return v_row;
end;
$$;

comment on function resolve_conflict is
  'PRD-OPS-WF-003. Records the judgement and clears conflict_flag for winner/both_valid. '
  'Escalating KEEPS the flag: an unsettled disagreement must keep reading as uncertain. '
  'Never edits knowledge — correcting the value is a separate edit through the gate.';

revoke all on function resolve_conflict(uuid, text, text, uuid) from public;
grant execute on function resolve_conflict(uuid, text, text, uuid) to authenticated;
