-- 0034_knowledge_claims.sql — extracted claims reach review, and disagreeing sources open conflicts.
--
-- PRD F17 has AI propose changes from a source capture, and PRD-OPS-SRC-005 opens a Conflict
-- automatically when two sources of tier T3 or better disagree. OPEN-014 found no place in
-- the schema for "source B claims 18:00" while source A's trust record backs 18:30.
--
-- The claim lives where the TRD already put it, without a new table (D-164):
--   - `ai_extractions.proposed_entities` keeps every claim the model made, verbatim;
--   - `change_candidates.new_value` carries the proposed value into the Review queue;
--   - `conflicts.values` carries both sides — the trusted source's current value and the new
--     source's claim — exactly as TRD §4.3 shapes it.
--
-- Nothing here writes a knowledge table. A claim is a proposal until a reviewer accepts it
-- and an editor makes the change through the publish gate (CLAUDE.md §5).

-- ══════════════════════════════════════════════════════════════════════════════
-- Conflicts can be opened by the system as well as by a verifier
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function open_conflict_internal(
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

  update trust_records
     set conflict_flag = true
   where entity_table = p_entity_table
     and entity_id = p_entity_id
     and field_name is not distinct from p_field_name;

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

comment on function open_conflict_internal(text, uuid, text, jsonb) is
  'Opens (or joins) a conflict, sets conflict_flag and queues a review task. No role check: '
  'backend only. open_conflict() is the verifier''s door onto the same body (0034).';

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
begin
  if not has_any_role('verifier', 'editor', 'admin') then
    raise exception 'not permitted to open a conflict' using errcode = '42501';
  end if;

  return open_conflict_internal(p_entity_table, p_entity_id, p_field_name, p_values);
end;
$$;

revoke all on function open_conflict_internal(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function open_conflict(text, uuid, text, jsonb) from public, anon;
grant execute on function open_conflict(text, uuid, text, jsonb) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Reading a field's current value as comparable text
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function knowledge_field_text(
  p_entity_table text,
  p_entity_id    uuid,
  p_field_name   text,
  p_locale       text default 'en'
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if p_entity_table not in ('destinations', 'places', 'experiences', 'routes', 'availability_rules',
                            'transport_connections', 'guidance_blocks', 'phrases', 'advisories',
                            'accessibility_records')
     or not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = p_entity_table and column_name = p_field_name
     ) then
    return null;
  end if;

  execute format('select to_jsonb(t) -> %L from %I t where t.id = $1', p_field_name, p_entity_table)
    into v_value using p_entity_id;

  if v_value is null or v_value = 'null'::jsonb then
    return null;
  elsif p_field_name like '%\_i18n' then
    return coalesce(nullif(v_value ->> p_locale, ''), v_value ->> 'en');
  elsif jsonb_typeof(v_value) = 'string' then
    return v_value #>> '{}';
  end if;

  return v_value::text;
end;
$$;

create or replace function normalise_claim_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
$$;

revoke all on function knowledge_field_text(text, uuid, text, text) from public, anon, authenticated;
revoke all on function normalise_claim_text(text) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Recording an extraction
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Stores what the model claimed about a capture and routes each claim.
 *
 * Claims were already grounded in code before they arrive (`groundKnowledgeClaims`: the
 * excerpt is in the capture, and the value's times and numbers are in the excerpt). Here:
 *   - a claim about a field that does not exist, or that matches what we already hold, goes
 *     nowhere — agreement is not news;
 *   - every other claim opens (or fills in) a change candidate carrying the proposed value;
 *   - if this source is tier T3 or better and the field is backed by a DIFFERENT T3-or-better
 *     source at human_reviewed or above, the disagreement opens a conflict, which flags the
 *     field as uncertain for travelers until a verifier settles it.
 *
 * Service role only: the ingestion runner is the only caller.
 */
create or replace function record_extraction(
  p_capture_id uuid,
  p_provider   text,
  p_model      text,
  p_claims     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capture record;
  v_extraction uuid;
  v_claim jsonb;
  v_table text;
  v_entity uuid;
  v_field text;
  v_locale text;
  v_current text;
  v_candidate uuid;
  v_trusted record;
  v_candidates int := 0;
  v_conflicts int := 0;
  v_skipped int := 0;
begin
  select sc.id, sc.source_id, sc.captured_at, s.tier
    into v_capture
    from source_captures sc
    join sources s on s.id = sc.source_id
   where sc.id = p_capture_id;

  if not found then
    raise exception 'capture not found' using errcode = 'no_data_found';
  end if;

  if p_claims is null or jsonb_typeof(p_claims) <> 'array' then
    raise exception 'claims must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  insert into ai_extractions (capture_id, model, provider, proposed_entities)
  values (p_capture_id, p_model, p_provider, p_claims)
  returning id into v_extraction;

  for v_claim in select value from jsonb_array_elements(p_claims)
  loop
    v_table := v_claim ->> 'entity_table';
    v_field := v_claim ->> 'field_name';
    v_locale := coalesce(nullif(v_claim ->> 'locale', ''), 'en');

    begin
      v_entity := (v_claim ->> 'entity_id')::uuid;
    exception when invalid_text_representation then
      v_skipped := v_skipped + 1;
      continue;
    end;

    v_current := knowledge_field_text(v_table, v_entity, v_field, v_locale);

    if not exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = v_table and column_name = v_field
       )
       or coalesce(btrim(v_claim ->> 'value'), '') = ''
       or normalise_claim_text(v_current) = normalise_claim_text(v_claim ->> 'value') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_candidate := open_change_candidate(
      v_table, v_entity, v_field, v_capture.source_id, p_capture_id,
      left(v_claim ->> 'excerpt', 1000),
      case when v_current is null then null else to_jsonb(v_current) end
    );

    update change_candidates
       set new_value = jsonb_build_object(
             'value', v_claim ->> 'value',
             'locale', v_locale,
             'confidence', v_claim ->> 'confidence',
             'origin', 'ai_extracted',
             'extraction_id', v_extraction)
     where id = v_candidate
       and new_value is null;

    v_candidates := v_candidates + 1;

    if v_capture.tier <= 'T3' and v_current is not null then
      select t.source_id, t.source_tier, t.verified_at
        into v_trusted
        from trust_records t
       where t.entity_table = v_table
         and t.entity_id = v_entity
         and t.field_name = v_field
         and t.source_id is distinct from v_capture.source_id
         and t.source_tier <= 'T3'
         and t.verification_status >= 'human_reviewed'
         and t.verification_status <> 'disputed'
       limit 1;

      if found then
        perform open_conflict_internal(v_table, v_entity, v_field, jsonb_build_array(
          jsonb_build_object('source_id', v_trusted.source_id, 'tier', v_trusted.source_tier,
                             'value', v_current, 'captured_at', v_trusted.verified_at),
          jsonb_build_object('source_id', v_capture.source_id, 'tier', v_capture.tier,
                             'value', v_claim ->> 'value', 'captured_at', v_capture.captured_at,
                             'extraction_id', v_extraction)
        ));
        v_conflicts := v_conflicts + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'extraction_id', v_extraction,
    'candidates', v_candidates,
    'conflicts', v_conflicts,
    'skipped', v_skipped
  );
end;
$$;

comment on function record_extraction(uuid, text, text, jsonb) is
  'Stores grounded AI claims for a capture, opens change candidates with proposed values, and '
  'opens conflicts when T3-or-better sources disagree (PRD F17, PRD-OPS-SRC-005, OPEN-014).';

revoke all on function record_extraction(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function record_extraction(uuid, text, text, jsonb) to service_role;
