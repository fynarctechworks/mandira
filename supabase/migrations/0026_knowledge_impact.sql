-- 0026_knowledge_impact.sql — a published change reaches the journeys that contain it.
--
-- `knowledge_update` has been in `change_trigger_enum` since 0001 and nothing has ever
-- raised it. So today an operator can correct a temple's evening timing, publish it, and
-- every traveler with that item in tomorrow's plan keeps the old time. The knowledge is
-- right and the journeys are wrong, which is worse than either alone.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- THE PRIVACY CONSTRAINT THAT SHAPES ALL OF THIS
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Building a Change Card needs the travelers — mobility drives buffers and the physical
-- load check. And `traveler_profiles` has NO Ops policy at all, deliberately and
-- permanently (AUTHORIZATION_MODEL; CLAUDE.md §5).
--
-- So Ops does not evaluate anything on a traveler's behalf. It records a fact about
-- PUBLISHED KNOWLEDGE — this entity changed, at this time — and the traveler's own session
-- notices it on their next load and evaluates it under their own RLS with their own
-- profiles. Nothing about a person crosses into Ops, and the number an approver sees comes
-- from a function that returns counts and nothing else.
--
-- Ops writes a log row. It never writes a journey. The plan moves only when the traveler
-- taps an option (PRD Principle 6), exactly as it does for every other trigger.

-- ══════════════════════════════════════════════════════════════════════════════
-- What changed, and when
-- ══════════════════════════════════════════════════════════════════════════════

create table knowledge_updates (
  id             uuid primary key default gen_random_uuid(),
  entity_table   text not null,
  entity_id      uuid not null,
  -- Denormalised so a traveler can filter to their own destination without reading the
  -- knowledge tables directly (they have no grant on those — only on the published views).
  destination_id uuid references destinations (id) on delete cascade,
  changed_fields jsonb not null default '[]'::jsonb,
  published_at   timestamptz not null default now(),
  published_by   uuid references auth.users (id) on delete set null
);

comment on table knowledge_updates is
  'PRD-OPS-WF-007. Append-only log of published knowledge changing, written by '
  'publish_entity(). Readable by any signed-in traveler: it names published knowledge and '
  'nothing about anybody. The traveler''s own session turns it into a Change Card.';

create index knowledge_updates_destination_idx
  on knowledge_updates (destination_id, published_at desc);
create index knowledge_updates_entity_idx on knowledge_updates (entity_table, entity_id);

alter table knowledge_updates enable row level security;

-- Any signed-in traveler reads it. There is nothing here to protect — every row names an
-- entity that is, by definition, published — and a traveler needs to know their own plan
-- may be out of date.
grant select on knowledge_updates to authenticated;
grant select, insert on knowledge_updates to service_role;

create policy knowledge_updates_read on knowledge_updates
  for select to authenticated using (true);

-- Deliberately no insert policy and no insert grant. Rows come from the helper below,
-- which `publish_entity()` calls — and that is the only path to published status in the
-- first place. A hand-written row would announce a change that never went through the gate.

/**
 * Records that published knowledge changed.
 *
 * `security definer` for the same reason `record_audit` is: `publish_entity` runs as the
 * approver, who has no insert on this table and should not. The privileged step is narrow
 * — one insert, into one append-only log — and the authorization is re-checked here rather
 * than trusted from the caller.
 */
create or replace function record_knowledge_update(
  p_entity_table   text,
  p_entity_id      uuid,
  p_destination_id uuid,
  p_changed_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not has_any_role('approver', 'admin') then
    raise exception 'only an approver announces a knowledge change' using errcode = '42501';
  end if;

  insert into knowledge_updates
    (entity_table, entity_id, destination_id, changed_fields, published_by)
  values (p_entity_table, p_entity_id, p_destination_id,
          coalesce(p_changed_fields, '[]'::jsonb), auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function record_knowledge_update(text, uuid, uuid, jsonb) from public;
grant execute on function record_knowledge_update(text, uuid, uuid, jsonb)
  to authenticated, service_role;

/*
 * When this journey last looked.
 *
 * Nullable, and that is the point: an existing journey starts with NULL and is treated as
 * having seen everything up to now, so switching this on does not greet every traveler
 * with a backlog of every publish since March.
 */
alter table journeys add column if not exists knowledge_checked_at timestamptz;

comment on column journeys.knowledge_checked_at is
  'PRD-OPS-WF-007. Last time this journey was compared against knowledge_updates. NULL = '
  'never checked; treated as "seen everything so far" rather than "seen nothing".';

-- ══════════════════════════════════════════════════════════════════════════════
-- The impact an approver sees
-- ══════════════════════════════════════════════════════════════════════════════

/**
 * How many live journeys contain this entity.
 *
 * COUNTS ONLY, and that is the whole design. PRD F18 asks an approver for "the list of
 * affected upcoming journeys (count)" — a number, so they know whether they are about to
 * interrupt three people or three hundred. It returns no identifier, no title, no traveler
 * and no item; there is nothing here that could be joined back to a person.
 *
 * `security definer` because Ops has no read on `journeys` or `journey_items` and must not
 * gain one. The function is the only thing that crosses that line, it crosses it in one
 * direction, and what comes back is an aggregate.
 */
create or replace function affected_journey_count(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active   int := 0;
  v_upcoming int := 0;
  v_first    date;
begin
  if not has_any_role('approver', 'admin', 'editor') then
    raise exception 'not permitted to read journey impact' using errcode = '42501';
  end if;

  /*
   * Only journeys that are actually live and not yet over. A change to something in a
   * journey that finished last month is not news, and counting it would make every impact
   * number grow forever and mean less each time.
   */
  select
    count(*) filter (where j.status = 'active'),
    count(*) filter (where j.status = 'upcoming'),
    min(j.start_date)
  into v_active, v_upcoming, v_first
  from journeys j
  where j.deleted_at is null
    and j.status in ('active', 'upcoming')
    and coalesce(j.end_date, j.start_date) >= current_date
    and exists (
      select 1 from journey_items i
      where i.journey_id = j.id
        and i.deleted_at is null
        and case p_entity_table
              when 'experiences'           then i.experience_id = p_entity_id
              when 'places'                then i.place_id = p_entity_id
              when 'routes'                then i.route_id = p_entity_id
              when 'transport_connections' then i.transport_connection_id = p_entity_id
              -- A destination-level or guidance change touches no single item, so it
              -- reports zero rather than guessing at "everyone in that destination".
              else false
            end
    );

  return jsonb_build_object(
    'active', v_active,
    'upcoming', v_upcoming,
    'total', v_active + v_upcoming,
    'first_start_date', v_first
  );
end;
$$;

comment on function affected_journey_count is
  'PRD-OPS-WF-007. Aggregate only — no identifiers, no items, no traveler profiles. The '
  'single security definer crossing from Ops into journey data, and it returns numbers.';

revoke all on function affected_journey_count(text, uuid) from public;
grant execute on function affected_journey_count(text, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Publishing records the change
-- ══════════════════════════════════════════════════════════════════════════════

/**
 * `publish_entity`, unchanged except for one statement at the end.
 *
 * Replaced in full rather than patched, because a function body cannot be amended in
 * place. Everything above the new block is identical to `0011`: the same table allowlist,
 * the same role check, the same validation, the same separation of duties.
 */
create or replace function publish_entity(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
as $$
declare
  problems jsonb;
  last_editor uuid;
  actor uuid := (select auth.uid());
  v_destination uuid;
  v_fields jsonb := '[]'::jsonb;
begin
  if p_entity_table not in ('destinations', 'places', 'experiences', 'routes',
                            'transport_connections', 'guidance_blocks', 'phrases', 'advisories') then
    raise exception 'Cannot publish %', p_entity_table using errcode = 'check_violation';
  end if;

  if not has_any_role('approver', 'admin') then
    raise exception 'Publishing needs the approver role' using errcode = 'insufficient_privilege';
  end if;

  problems := validate_for_publish(p_entity_table, p_entity_id);
  if jsonb_array_length(problems) > 0 then
    raise exception 'Not ready to publish: %', problems::text using errcode = 'check_violation';
  end if;

  select v.changed_by into last_editor
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id and v.changed_by is not null
   order by v.version desc
   limit 1;

  if last_editor is not null and last_editor = actor then
    raise exception 'Separation of duties: you last changed this, so someone else must approve it'
      using errcode = 'check_violation';
  end if;

  execute format(
    'update %I set status = ''published'', published_at = now() where id = $1',
    p_entity_table
  ) using p_entity_id;

  perform record_audit('publish', p_entity_table, p_entity_id, null,
                       jsonb_build_object('status', 'published'));

  -- ── New in 0026: say that published knowledge changed ──────────────────────
  --
  -- Inside the same transaction as the status change, so a published entity and the
  -- announcement of it cannot disagree. `destinations` names itself; `guidance_blocks`
  -- has no destination column and records null.
  if p_entity_table = 'destinations' then
    v_destination := p_entity_id;
  elsif p_entity_table <> 'guidance_blocks' then
    execute format('select destination_id from %I where id = $1', p_entity_table)
      into v_destination using p_entity_id;
  end if;

  /*
   * Which fields moved, taken from `entity_versions.changed_fields` rather than derived
   * again here. The versioning trigger already computes it on every write, and a second
   * implementation of "what changed" is a second thing that can disagree with the audit
   * trail — the Change Card would then say something the history does not.
   *
   * An entity with no version yet records an empty list, which reads downstream as newly
   * published rather than as "nothing changed".
   */
  select coalesce(to_jsonb(v.changed_fields), '[]'::jsonb) into v_fields
    from entity_versions v
   where v.entity_table = p_entity_table and v.entity_id = p_entity_id
   order by v.version desc
   limit 1;

  perform record_knowledge_update(p_entity_table, p_entity_id, v_destination, v_fields);

  return jsonb_build_object('published', true);
end;
$$;

comment on function publish_entity(text, uuid) is
  'The only path to published status. Enforces F18 validation and separation of duties, '
  'and records a knowledge_updates row so affected journeys hear about it (PRD-OPS-WF-007).';

grant execute on function publish_entity(text, uuid) to authenticated;
