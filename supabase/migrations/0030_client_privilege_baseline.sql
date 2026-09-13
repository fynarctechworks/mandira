-- 0030_client_privilege_baseline.sql — client roles hold exactly what the migrations grant.
--
-- WHAT WAS WRONG. Supabase's image gives the `postgres` role default privileges in `public`:
-- every table a migration creates is granted SELECT/INSERT/UPDATE/DELETE to `anon` and
-- `authenticated`, and every function EXECUTE to both. 0022 trimmed TRUNCATE/REFERENCES/
-- TRIGGER and left the rest. Measured on 2026-09-13: `anon` held full DML on all 56 tables
-- (traveler_profiles and audit_log included) and EXECUTE on 30 SECURITY DEFINER functions,
-- among them `journey_summary_payload(journey_id)`, which projects any journey with no
-- ownership check, and `open_change_candidate`, which fills the Ops review queue.
--
-- RLS was holding the rows, which is why nothing visibly leaked. But the design (D-029,
-- 0007, 0008) is two layers — no grant, THEN a policy — and the first layer did not exist.
-- A single permissive policy added later would have exposed a table to the internet.
--
-- THE FIX, in three steps:
--   1. Default privileges for `postgres` in `public` grant clients nothing, so the next
--      table or function starts closed.
--   2. Every table, view and function privilege held by anon/authenticated is revoked.
--   3. Exactly the grants the migrations declare are re-applied, from one list below — the
--      reviewable statement of the client surface.
--
-- `service_role` is untouched on tables (0025/0029) and receives EXECUTE on functions
-- explicitly, because it previously held it only through PUBLIC and the backend jobs call
-- several functions by RPC.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Nothing is granted by default from here on
-- ══════════════════════════════════════════════════════════════════════════════

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Clear what the defaults handed out
-- ══════════════════════════════════════════════════════════════════════════════

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Column-level grants survive a table-level revoke, so the two tables that use them are
-- cleared explicitly before being re-granted below.
revoke select (id, reporter_hash, report_type, entity_table, entity_id, field_name, description,
               media_id, journey_id, locale, client_created_at, status, resolution_note,
               resolved_by, resolved_at, notified_user, created_at, updated_at, user_id)
  on user_reports from authenticated;
revoke update (status, resolution_note, resolved_by, resolved_at, notified_user)
  on user_reports from authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3a. Tables — the declared client surface (0008, 0026, 0029)
-- ══════════════════════════════════════════════════════════════════════════════

-- Public reference data.
grant select on locales to anon, authenticated;
grant insert, update, delete on locales to authenticated;
grant select on feature_flags to anon, authenticated;
grant insert, update, delete on feature_flags to authenticated;
grant insert on analytics_events to anon, authenticated;
grant select on analytics_events to authenticated;

-- Media: the uploader's identity is withheld by column (D-033).
grant select (id, storage_path, media_type, width, height, caption_i18n, credit, licence,
              created_at, updated_at, deleted_at)
  on media_assets to anon, authenticated;
grant insert, update, delete on media_assets to authenticated;
grant select on entity_media to anon;

-- Knowledge base: Ops roles through RLS; travelers read only the v_published_* views.
do $$
declare
  t text;
begin
  foreach t in array array[
    'destinations', 'circuits', 'circuit_destinations', 'destination_links',
    'places', 'routes', 'route_places', 'accessibility_records',
    'experiences', 'availability_rules', 'transport_connections',
    'guidance_blocks', 'phrases', 'advisories',
    'live_feed_configs', 'live_feed_readings', 'travel_estimates',
    'entity_media', 'ui_strings', 'sources', 'trust_records'
  ] loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;

  foreach t in array array[
    'ingestion_jobs', 'source_captures', 'ai_extractions', 'change_candidates', 'conflicts',
    'review_tasks'
  ] loop
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end;
$$;

grant select on entity_versions, audit_log to authenticated;

-- Identity and personal data (owner-scoped by RLS).
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on traveler_profiles to authenticated;
grant select, insert, delete on saved_places to authenticated;
grant select, insert on personalization_signals to authenticated;
grant select on user_roles to authenticated;
grant insert, update, delete on user_roles to authenticated;

-- Journeys and everything owned through them.
do $$
declare
  t text;
begin
  foreach t in array array[
    'journeys', 'journey_destinations', 'journey_travelers', 'journey_items',
    'journey_change_events', 'prepare_tasks', 'journey_records', 'journey_shares',
    'journey_item_dependencies', 'journey_item_notes', 'notification_subscriptions'
  ] loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end;
$$;

grant select, update on notifications to authenticated;

-- Reports: the reporter's identity is withheld by column.
grant insert on user_reports to authenticated;
grant select (id, reporter_hash, report_type, entity_table, entity_id, field_name, description,
              media_id, journey_id, locale, client_created_at, status, resolution_note,
              resolved_by, resolved_at, notified_user, created_at, updated_at)
  on user_reports to authenticated;
grant update (status, resolution_note, resolved_by, resolved_at, notified_user)
  on user_reports to authenticated;

-- What changed, not who changed it (0029 S-9).
grant select (id, entity_table, entity_id, destination_id, changed_fields, published_at)
  on knowledge_updates to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3b. Views — every traveler-facing published view, nothing else
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v text;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname like 'v\_published\_%'
  loop
    execute format('grant select on %I to anon, authenticated', v);
  end loop;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3c. Functions
-- ══════════════════════════════════════════════════════════════════════════════

-- Called inside the published views or anon-reachable policies, so anon must execute them.
-- Each answers only for published content (0029) or reads nothing at all.
grant execute on function
  latitude(destinations), longitude(destinations), latitude(places), longitude(places),
  critical_fields_gated(text, uuid, text[]),
  entity_trust(text, uuid),
  accessibility_for(uuid, uuid),
  route_stops_for(uuid),
  share_summary(text, text),
  request_is_client(),
  entity_is_published(text, uuid),
  is_ops(),
  -- Pure helpers with no table access.
  source_tier_label(source_tier_enum),
  i18n_text(jsonb),
  has_any_locale(jsonb),
  critical_fields(text)
to anon, authenticated;

-- Signed-in only. Every SECURITY DEFINER entry here checks its caller internally.
grant execute on function
  has_role(ops_role_enum),
  has_any_role(ops_role_enum[]),
  owns_journey(uuid),
  owns_journey_item(uuid),
  -- Called by the trust-record trigger, which runs as the writing Ops user.
  derive_confidence(source_tier_enum, verification_status_enum, freshness_enum, boolean, boolean),
  derive_freshness(timestamptz, date),
  my_journey_summary(uuid, text),
  validate_for_publish(text, uuid),
  publish_entity(text, uuid),
  decide_change_candidate(uuid, text, text),
  affected_journey_count(text, uuid),
  freshness_rows(text, uuid, int),
  assign_reverification(uuid[], uuid, text),
  open_conflict(text, uuid, text, jsonb),
  resolve_conflict(uuid, text, text, uuid)
to authenticated;

-- Deliberately granted to no client role:
--   journey_summary_payload  — the raw projection; share_summary / my_journey_summary are the doors
--   open_change_candidate    — the ingestion runner's write, service_role only
--   record_knowledge_update  — called only inside publish_entity
--   record_audit, validate_for_publish_rules, audit_*, job and prune functions — backend only
