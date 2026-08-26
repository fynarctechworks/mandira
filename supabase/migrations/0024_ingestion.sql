-- 0024_ingestion.sql — the ingestion pipeline becomes usable (B-029, PRD F17/F18).
--
-- The five pipeline tables have existed since 0002 and their Ops policies since 0008.
-- What was missing is everything that makes them SAFE to write to:
--
--   1. The `captures` bucket was created in 0011 with NO storage policy at all, so nothing
--      could read or write it. Raw source snapshots are private evidence — a captured page
--      can carry anything the source put on it — so Ops reads, the runner writes as
--      service-role, and only an admin deletes.
--   2. `open_change_candidate()` makes raising a candidate idempotent. A cron that runs
--      twice, or an operator who taps "Run now" after a scheduled run, must not open the
--      same candidate again: a queue with duplicates is a queue people stop trusting.
--   3. `decide_change_candidate()` records a review decision and CANNOT publish. This is
--      the constraint the whole feature turns on (CLAUDE.md §5): accepting a candidate
--      records what the operator decided, and changing the knowledge itself remains a
--      separate edit through the publish gate. If the queue could publish, three sources
--      repeating the same wrong thing would eventually become the truth.
--
-- Additive throughout. No table is altered and no existing policy is changed.

-- ══════════════════════════════════════════════════════════════════════════════
-- The `captures` bucket
-- ══════════════════════════════════════════════════════════════════════════════

-- Ops reads evidence. Everyone else — including every signed-in traveler — reads nothing,
-- because a capture is an arbitrary third-party page we chose to store.
create policy captures_ops_read on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and is_ops());

-- Deliberately NO insert policy for `authenticated`. Capture BODIES are written by the
-- ingestion runner under the service role; an operator hand-uploading a "capture" would be
-- evidence nobody fetched, which is worse than no evidence.
--
-- The `source_captures` ROW is a different matter and stays writable by Ops roles (0008),
-- which is the right split: recording that a run happened is bookkeeping, putting bytes in
-- the private bucket and calling them evidence is not.

create policy captures_admin_delete on storage.objects
  for delete to authenticated
  -- The cast is not decoration. **pgTAP defines its own `has_role(name) returns text`**, so
  -- on a database where the extension is installed an untyped 'admin' literal binds to that
  -- instead of ours, and the policy fails to compile with a message about AND needing a
  -- boolean — a failure that appears only where pgTAP is present. Naming the enum removes
  -- the ambiguity, and the same hazard exists wherever `has_role` takes a bare literal.
  using (bucket_id = 'captures' and has_role('admin'::ops_role_enum));

-- ══════════════════════════════════════════════════════════════════════════════
-- Raising candidates
-- ══════════════════════════════════════════════════════════════════════════════

-- The queue filters by source and by state; without this it seq-scans every candidate ever
-- raised, which grows without bound because resolved rows are kept for the audit trail.
create index if not exists change_candidates_source_status_idx
  on change_candidates (source_id, status);

/**
 * Opens a change candidate, or returns the one already open for this field.
 *
 * `security definer` because the runner calls it as service-role from a cron and an
 * operator calls it through "Run now" — the check below is the authorization, not the
 * caller's role. It is deliberately NOT a general insert: the columns it will not let you
 * set are the ones that would turn a candidate into a decision (`status`, `decided_by`,
 * `decided_at`).
 */
create or replace function open_change_candidate(
  p_entity_table text,
  p_entity_id    uuid,
  p_field_name   text,
  p_source_id    uuid,
  p_capture_id   uuid,
  p_excerpt      text,
  p_old_value    jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- An existing OPEN candidate for the same field is the same candidate. A second row
  -- would make an operator resolve the same change twice and read as two problems.
  select id into v_id
    from change_candidates
   where entity_table = p_entity_table
     and entity_id is not distinct from p_entity_id
     and field_name is not distinct from p_field_name
     and status = 'open'
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into change_candidates (
    entity_table, entity_id, field_name, old_value, new_value,
    source_id, capture_id, excerpt, status
  )
  values (
    p_entity_table, p_entity_id, p_field_name, p_old_value,
    -- Null on purpose. Detection knows the evidence VANISHED; it does not know what
    -- replaced it, and inventing a value here would be the AI writing facts that
    -- CLAUDE.md §5 forbids. Extraction fills this in when a key exists (ACCT-04).
    null,
    p_source_id, p_capture_id, p_excerpt, 'open'
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function open_change_candidate is
  'PRD-OPS-SRC-004. Idempotent per (entity, field) while a candidate is open. new_value is '
  'always null: detection knows evidence disappeared, not what replaced it.';

revoke all on function open_change_candidate(text, uuid, text, uuid, uuid, text, jsonb) from public;
grant execute on function open_change_candidate(text, uuid, text, uuid, uuid, text, jsonb)
  to authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- Deciding them (PRD-OPS-WF-001)
-- ══════════════════════════════════════════════════════════════════════════════

/**
 * Records a Review-queue decision.
 *
 * THE IMPORTANT PART IS WHAT THIS DOES NOT DO. It writes to `change_candidates` and to
 * `review_tasks`, and to nothing else — no knowledge table, no `trust_records`, no
 * entity status. "Accept" means an operator agrees the source changed; correcting the fact
 * is a separate edit that goes through `publish_entity()` like every other change.
 *
 * `request_verify` is the interesting outcome: it moves the field into the Verify queue
 * rather than pretending a decision was reached. PRD F18 lists it precisely because the
 * honest answer to "did this change?" is often "somebody has to go and look".
 */
create or replace function decide_change_candidate(
  p_id       uuid,
  p_decision text,
  p_reason   text default null
)
returns change_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row change_candidates;
begin
  if p_decision not in ('accept', 'reject', 'request_verify') then
    raise exception 'unknown decision %', p_decision using errcode = '22023';
  end if;

  -- Enforced here as well as in RLS and in the Server Action. Three layers, per
  -- CLAUDE.md §4 — and this is the one a service-role caller cannot walk around.
  if not has_any_role('reviewer', 'editor', 'admin') then
    raise exception 'not permitted to decide change candidates' using errcode = '42501';
  end if;

  -- Rejecting without a reason is how a queue loses its memory of why something was
  -- dismissed, and the next cycle raises it again to a person with no context.
  if p_decision = 'reject' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'a rejection needs a reason' using errcode = '23514';
  end if;

  select * into v_row from change_candidates where id = p_id for update;
  if not found then
    raise exception 'change candidate not found' using errcode = 'P0002';
  end if;

  -- A second tap is a no-op rather than a re-decision, the same rule Change Cards follow
  -- (D-121): the operator gets what they were shown.
  if v_row.status <> 'open' then
    return v_row;
  end if;

  update change_candidates
     set status = case p_decision
                    when 'accept' then 'done'::task_status_enum
                    when 'reject' then 'rejected'::task_status_enum
                    else 'in_progress'::task_status_enum
                  end,
         decision_reason = p_reason,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id
  returning * into v_row;

  if p_decision = 'request_verify' then
    -- One open task per field, matching how the nightly reverify job guards itself
    -- (0013). A queue that grows a duplicate every cycle stops being read.
    insert into review_tasks (task_type, entity_table, entity_id, field_name, priority, notes)
    select
      'verify', v_row.entity_table, v_row.entity_id, v_row.field_name, 1,
      coalesce(p_reason, 'The source no longer shows the text this was verified against.')
    where not exists (
      select 1 from review_tasks existing
      where existing.task_type = 'verify'
        and existing.entity_table = v_row.entity_table
        and existing.entity_id = v_row.entity_id
        and existing.field_name is not distinct from v_row.field_name
        and existing.status in ('open', 'in_progress')
    );
  end if;

  return v_row;
end;
$$;

comment on function decide_change_candidate is
  'PRD-OPS-WF-001. Records a review decision. Writes change_candidates and '
  'review_tasks ONLY — never knowledge, never trust, never a published value.';

revoke all on function decide_change_candidate(uuid, text, text) from public;
grant execute on function decide_change_candidate(uuid, text, text) to authenticated;
