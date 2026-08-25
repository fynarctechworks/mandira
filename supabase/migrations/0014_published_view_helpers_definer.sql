-- 0014_published_view_helpers_definer.sql — repair the traveler read surface.
--
-- BUG (pre-existing since 0007, found while building 0015): every `v_published_*` view
-- that carries a trust column or a publish gate raises
--
--     permission denied for table trust_records
--
-- for `anon` and for any `authenticated` user without an Ops role — which is every
-- traveler. The whole traveler read surface is unusable the moment there is content in it.
--
-- WHY IT WAS INVISIBLE. A view reads its referenced TABLES with the view owner's rights,
-- but a FUNCTION called inside the view runs with the invoker's, and its own table access
-- is checked against the invoker. `critical_fields_gated()` and `entity_trust()` both read
-- `trust_records`, which 0008 correctly restricts to Ops (`is_ops()`). Per-row functions
-- are only evaluated when there ARE rows, so all nine views test clean while empty — and
-- every pgTAP test to date has run as `postgres`. It would have surfaced on the day B-013
-- seeded the first real content, which is the worst possible time to find it.
--
-- THE FIX. The helper functions the published views depend on become SECURITY DEFINER with
-- a pinned `search_path`. That is exactly D-029's intent restated in the mechanism: the
-- views are the traveler read surface, so their helpers must be able to read the gate on a
-- traveler's behalf. Nothing about the gate itself changes — an entity that failed
-- `critical_fields_gated` before still fails it now.
--
-- WHAT THIS COSTS, stated plainly. EXECUTE cannot be revoked from the client roles: a
-- function called inside a view is checked against the INVOKER, so revoking it breaks the
-- view for exactly the people this repairs it for (verified, not assumed). So a caller who
-- already knows the UUID of an UNPUBLISHED entity can call `entity_trust` directly and
-- learn its source name and verification dates.
--
-- That is accepted deliberately (D-078). The alternative — inlining both helpers into all
-- nine views so the owner's table rights apply — would duplicate the publish gate nine
-- times, and a gate restated nine times is a gate that will eventually disagree with
-- itself. Duplicated security logic is a likelier source of a real breach than a lookup
-- that requires already knowing a secret id.

-- ══════════════════════════════════════════════════════════════════════════════
-- The publish gate. Same logic as 0007, verbatim — only the rights change.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function critical_fields_gated(
  p_entity_table text,
  p_entity_id uuid,
  p_fields text[]
)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from unnest(p_fields) as required(field_name)
    where not exists (
      select 1
      from trust_records t
      where t.entity_table = p_entity_table
        and t.entity_id = p_entity_id
        and t.field_name = required.field_name
        and t.verification_status >= 'human_reviewed'
    )
  );
$$;

comment on function critical_fields_gated(text, uuid, text[]) is
  'True when every listed critical field has trust >= human_reviewed. Missing record = not gated. '
  'SECURITY DEFINER so the published views can evaluate the gate for a traveler (0014).';

-- ══════════════════════════════════════════════════════════════════════════════
-- The trust badge payload. Same shape as 0007 — only the rights change.
--
-- This is the one that makes PRD F9 possible at all: "100% of published critical fields
-- render a badge", and a badge cannot render from a permission error.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function entity_trust(p_entity_table text, p_entity_id uuid)
returns jsonb
language sql
stable
parallel safe
security definer
set search_path = public
as $$
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
        'conflict_flag', t.conflict_flag
      )
    ),
    '{}'::jsonb
  )
  from trust_records t
  left join sources s on s.id = t.source_id
  where t.entity_table = p_entity_table
    and t.entity_id = p_entity_id;
$$;

comment on function entity_trust(text, uuid) is
  'Trust metadata for one entity, keyed by field name. SECURITY DEFINER so a traveler can '
  'see a badge at all (PRD F9). Callable directly by client roles — see the 0014 header.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Granted explicitly rather than inherited from PUBLIC.
--
-- Same effective access, but a role added later does not silently acquire it, and the
-- intended callers are readable in the schema instead of implied by a default.
-- ══════════════════════════════════════════════════════════════════════════════

revoke all on function critical_fields_gated(text, uuid, text[]) from public;
revoke all on function entity_trust(text, uuid) from public;

grant execute on function critical_fields_gated(text, uuid, text[]) to anon, authenticated;
grant execute on function entity_trust(text, uuid) to anon, authenticated;
