-- 0053_reverify_after_edit.sql — editing a published critical field un-verifies it.
--
-- The hole this closes: an editor changed a published temple's opening hours and travelers
-- saw the NEW value under the OLD "Verified" badge, because nothing tied the trust record to
-- the value it was recorded against. Verified means "somebody checked this against a source",
-- and the moment the words change that is no longer true of them.
--
-- What happens instead: the field is flagged, its badge drops to "Check locally" (the same
-- place a reported field lands, PRD-REPT-004), and a re-verify task opens for Ops. The entity
-- stays visible — hiding a temple because its closure note was corrected takes away what a
-- traveler came for; telling them plainly that this line has not been checked does not.

alter table trust_records add column needs_reverification boolean not null default false;

comment on column trust_records.needs_reverification is
  'The value changed after it was verified (0053). Travelers see "Check locally" until a verifier confirms the new value.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Verifying again is what clears it
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function trust_records_clear_reverification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A fresh look at the source: a new verification, a new status, or new evidence.
  if new.verified_at is distinct from old.verified_at
     or new.verification_status is distinct from old.verification_status
     or new.evidence_excerpt is distinct from old.evidence_excerpt then
    new.needs_reverification := false;
  end if;
  return new;
end;
$$;

create trigger trust_records_clear_reverification
  before update on trust_records
  for each row execute function trust_records_clear_reverification();

-- ══════════════════════════════════════════════════════════════════════════════
-- An edit to a published critical field flags it
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function flag_reverification_after_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fields text[] := critical_fields(tg_table_name);
  v_before jsonb := to_jsonb(old);
  v_after jsonb := to_jsonb(new);
  v_field text;
  v_published boolean;
begin
  if v_fields is null then
    return null;
  end if;

  /*
   * Only what travelers can already see. A draft is nobody's plan yet, and flagging it would
   * fill the verify queue with work on content that has not been published once.
   */
  if tg_table_name = 'availability_rules' then
    v_published := exists (
      select 1 from experiences e where e.id = new.experience_id and e.status = 'published');
  else
    v_published := (v_after ->> 'status') = 'published';
  end if;

  if not v_published then
    return null;
  end if;

  if array_length(v_fields, 1) is null then
    -- Availability rules are critical in their entirety, so their trust record carries a
    -- NULL field name and any change to the rule counts (0013).
    if (v_before - 'updated_at') is distinct from (v_after - 'updated_at') then
      update trust_records
         set needs_reverification = true
       where entity_table = tg_table_name
         and entity_id = new.id
         and field_name is null
         and verification_status >= 'human_reviewed';
    end if;
  else
    foreach v_field in array v_fields loop
      if v_before -> v_field is distinct from v_after -> v_field then
        update trust_records
           set needs_reverification = true
         where entity_table = tg_table_name
           and entity_id = new.id
           and field_name = v_field
           and verification_status >= 'human_reviewed';
      end if;
    end loop;
  end if;

  -- One open task per field, deduplicated the way the freshness monitor does it (0027).
  insert into review_tasks
    (task_type, entity_table, entity_id, field_name, related_id, priority, notes)
  select 'reverify', tr.entity_table, tr.entity_id, tr.field_name, tr.id, 1,
         'The value changed after it was verified.'
    from trust_records tr
   where tr.entity_table = tg_table_name
     and tr.entity_id = new.id
     and tr.needs_reverification
     and not exists (
       select 1 from review_tasks rt
        where rt.task_type in ('reverify', 'verify')
          and rt.entity_table = tr.entity_table
          and rt.entity_id = tr.entity_id
          and rt.field_name is not distinct from tr.field_name
          and rt.status in ('open', 'in_progress'));

  return null;
end;
$$;

comment on function flag_reverification_after_edit() is
  'Flags a published critical field for re-verification when its value changes, and opens a re-verify task (0053).';

revoke all on function flag_reverification_after_edit() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['places', 'experiences', 'transport_connections', 'availability_rules']
  loop
    execute format('drop trigger if exists %I on %I', t || '_flag_reverification', t);
    execute format(
      'create trigger %I after update on %I for each row '
      'execute function flag_reverification_after_edit()',
      t || '_flag_reverification', t);
  end loop;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- The badge payload carries it (0029's function, one key added)
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function entity_trust(p_entity_table text, p_entity_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  -- 0029 S-2's guard is kept exactly: a client asking about anything unpublished gets {}.
  select case
    when request_is_client()
         and not entity_is_published(p_entity_table, p_entity_id)
         and not is_ops()
      then '{}'::jsonb
    else (
      select coalesce(
        jsonb_object_agg(
          coalesce(t.field_name, 'entity'),
          jsonb_build_object(
            'confidence', t.confidence,
            'freshness', t.freshness,
            'verified_at', t.verified_at,
            'valid_until', t.valid_until,
            'source_name', s.name,
            'source_tier_label', source_tier_label(t.source_tier),
            'conflict_flag', t.conflict_flag,
            'needs_reverification', t.needs_reverification
          )
        ),
        '{}'::jsonb
      )
      from trust_records t
      left join sources s on s.id = t.source_id
      where t.entity_table = p_entity_table
        and t.entity_id = p_entity_id
    )
  end;
$$;

comment on function entity_trust(text, uuid) is
  'Trust metadata for one entity, keyed by field. Clients get {} for anything unpublished (0029 S-2); carries whether the value changed since it was verified (0053).';
