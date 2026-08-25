-- 0011_publish_validation.sql — storage buckets, publish validation, publish action.
--
-- ARCHITECTURE §6: "No feature bypasses the publish gate." So the gate lives here, in the
-- database, not in a route handler. `publish_entity()` is the only way an entity's status
-- becomes 'published', and it refuses unless every F18 validation rule passes and the
-- approver is not the person who last changed it.
--
-- The `v_published_*` views (0007) remain the second, independent layer: even a row wrongly
-- marked published stays invisible while its critical fields lack trust.

-- ══════════════════════════════════════════════════════════════════════════════
-- Storage buckets (TRD §6.1)
-- ══════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Licensed content only, served straight to travelers.
  ('media', 'media', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'audio/mpeg', 'audio/ogg']),
  -- Traveler-submitted photos; private, reached through signed URLs (M4).
  ('reports', 'reports', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  -- Raw source snapshots for the ingestion pipeline (M3).
  ('captures', 'captures', false, 10485760, null)
on conflict (id) do nothing;

-- Ops uploads media; everyone reads it. Traveler-facing images are public by design
-- (licensed content only), so the read policy is deliberately open.
create policy media_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

create policy media_ops_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and has_any_role('media', 'editor', 'admin'));

create policy media_ops_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and has_any_role('media', 'editor', 'admin'));

create policy media_ops_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and has_role('admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- Validation (PRD F18)
-- ══════════════════════════════════════════════════════════════════════════════

/** True when an `_i18n` column holds at least one non-blank value. */
create or replace function has_any_locale(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select exists (
    select 1 from jsonb_each_text(coalesce(p_value, '{}'::jsonb))
    where btrim(value) <> ''
  );
$$;

/*
 * Every reason an entity cannot be published, as a jsonb array of {field, message}.
 *
 * Returns problems rather than a boolean so the Approve screen can name the field — PRD
 * F18's acceptance is explicit that a blocked publish says WHICH field is at fault, not
 * merely that something is wrong.
 *
 * Empty array = publishable.
 */
create or replace function validate_for_publish(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  problems jsonb := '[]'::jsonb;
  add_problem text;
  rec record;
  ungated text[];
begin
  -- ── Critical-field trust (PRD-KNOW-003) ────────────────────────────────────
  -- Reuses the same rule the published views enforce, so the Approve screen and the
  -- traveler-facing gate can never disagree about what is missing.
  select coalesce(array_agg(required.field_name), '{}')
    into ungated
    from unnest(
      case p_entity_table
        when 'places' then array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
        when 'experiences' then array['advance_booking_required', 'advance_booking_how_i18n']
        when 'transport_connections' then array['duration_likely_minutes']
        else array[]::text[]
      end
    ) as required(field_name)
   where not exists (
     select 1 from trust_records t
     where t.entity_table = p_entity_table
       and t.entity_id = p_entity_id
       and t.field_name = required.field_name
       and t.verification_status >= 'human_reviewed'
   );

  if array_length(ungated, 1) is not null then
    foreach add_problem in array ungated loop
      problems := problems || jsonb_build_object(
        'field', add_problem,
        'message', 'Needs a trust record reviewed against a source'
      );
    end loop;
  end if;

  -- ── Open conflicts ─────────────────────────────────────────────────────────
  if exists (
    select 1 from conflicts c
    where c.entity_table = p_entity_table and c.entity_id = p_entity_id and c.status = 'open'
  ) then
    problems := problems || jsonb_build_object(
      'field', 'conflict',
      'message', 'An unresolved conflict is open on this entity'
    );
  end if;

  -- ── Media licence (PRD F18: "media has licence") ───────────────────────────
  if exists (
    select 1
    from entity_media em
    join media_assets m on m.id = em.media_id
    where em.entity_table = p_entity_table
      and em.entity_id = p_entity_id
      and m.deleted_at is null
      and coalesce(btrim(m.licence), '') = ''
  ) then
    problems := problems || jsonb_build_object(
      'field', 'media',
      'message', 'Attached media is missing a licence'
    );
  end if;

  -- ── Per-entity required fields ─────────────────────────────────────────────
  if p_entity_table = 'places' then
    select p.name_i18n, p.slug, p.location, d.centre, d.radius_km
      into rec
      from places p join destinations d on d.id = p.destination_id
     where p.id = p_entity_id;

    if not found then
      return jsonb_build_array(jsonb_build_object('field', 'entity', 'message', 'Not found'));
    end if;
    if not has_any_locale(rec.name_i18n) then
      problems := problems || jsonb_build_object('field', 'name_i18n', 'message', 'Needs a name in at least one language');
    end if;
    -- A pin outside its own destination is almost always a transposed lat/lng, and it
    -- would send a traveler to the wrong town.
    if rec.location is not null and rec.centre is not null
       -- Schema-qualified: this function pins search_path to public, and PostGIS lives in
       -- `extensions`.
       and not extensions.st_dwithin(rec.location, rec.centre, rec.radius_km * 1000) then
      problems := problems || jsonb_build_object(
        'field', 'location',
        'message', 'The pin is outside this destination''s radius'
      );
    end if;

  elsif p_entity_table = 'experiences' then
    select e.name_i18n, e.slug into rec from experiences e where e.id = p_entity_id;
    if not found then
      return jsonb_build_array(jsonb_build_object('field', 'entity', 'message', 'Not found'));
    end if;
    if not has_any_locale(rec.name_i18n) then
      problems := problems || jsonb_build_object('field', 'name_i18n', 'message', 'Needs a name in at least one language');
    end if;
    -- Not in F18's literal list, but an experience with no availability cannot be
    -- scheduled by the engine at all, so publishing it promises something undeliverable.
    if not exists (select 1 from availability_rules a where a.experience_id = p_entity_id) then
      problems := problems || jsonb_build_object(
        'field', 'availability',
        'message', 'No availability recorded, so this cannot be scheduled'
      );
    end if;

  elsif p_entity_table = 'destinations' then
    select d.name_i18n into rec from destinations d where d.id = p_entity_id;
    if not found then
      return jsonb_build_array(jsonb_build_object('field', 'entity', 'message', 'Not found'));
    end if;
    if not has_any_locale(rec.name_i18n) then
      problems := problems || jsonb_build_object('field', 'name_i18n', 'message', 'Needs a name in at least one language');
    end if;
  end if;

  return problems;
end;
$$;

comment on function validate_for_publish(text, uuid) is
  'PRD F18 pre-publish validation. Returns [] when publishable, else [{field,message}].';

-- ══════════════════════════════════════════════════════════════════════════════
-- Audit writer
--
-- D-035 leaves `audit_log` with no INSERT policy for anyone — the trail is append-only and
-- unreachable from ordinary code. This SECURITY DEFINER function is the controlled way in,
-- so callers can record an action without gaining the ability to edit or delete history.
-- The actor comes from the session, never from an argument, so an entry cannot be
-- attributed to someone else.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function record_audit(
  p_action text,
  p_entity_table text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_user_id, action, entity_table, entity_id, before, after)
  values ((select auth.uid()), p_action, p_entity_table, p_entity_id, p_before, p_after);
end;
$$;

comment on function record_audit(text, text, uuid, jsonb, jsonb) is
  'The only write path into audit_log. Actor comes from the session, never an argument.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Publish
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * The only path to `status = 'published'`.
 *
 * SECURITY INVOKER on purpose: RLS still applies to the UPDATE, so this cannot be used to
 * escalate. What it adds on top is the two rules a route handler must not be trusted with —
 * validation, and separation of duties (PRD-OPS-WF-009): the person who last changed an
 * entity cannot be the one who blesses it.
 */
create or replace function publish_entity(p_entity_table text, p_entity_id uuid)
returns jsonb
language plpgsql
as $$
declare
  problems jsonb;
  last_editor uuid;
  actor uuid := (select auth.uid());
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

  return jsonb_build_object('published', true);
end;
$$;

comment on function publish_entity(text, uuid) is
  'The only path to published status. Enforces F18 validation and separation of duties.';

grant execute on function record_audit(text, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function validate_for_publish(text, uuid) to authenticated;
grant execute on function publish_entity(text, uuid) to authenticated;
