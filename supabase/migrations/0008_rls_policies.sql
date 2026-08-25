-- 0008_rls_policies.sql — TRD §4.9 RLS matrix (TRD-DB-003, PRD-PRIV-002).
--
-- RLS was enabled on every table as it was created (0002–0006), so until now the database
-- has been deny-all to anon and authenticated. This migration opens exactly the doors the
-- §4.9 matrix describes, and no others.
--
-- TWO LAYERS, BOTH REQUIRED. A policy without a GRANT is inert, and a GRANT without a
-- policy returns nothing. Tables created by migrations start with no DML privileges for
-- anon/authenticated (verified: `authenticated` held only TRUNCATE/REFERENCES/TRIGGER), so
-- every access below needs both halves. Grants are written per table alongside the policy
-- rather than in one sweeping loop, so that reading any section tells you the whole story.
--
-- `service_role` has BYPASSRLS and is used only in server route handlers and Edge
-- Functions (TRD §6.1) — it is intentionally absent from everything below.
--
-- Knowledge stays view-only for travelers (D-029): the base knowledge tables get NO
-- anon/authenticated policy, so `v_published_*` remains the sole traveler read surface.

-- ══════════════════════════════════════════════════════════════════════════════
-- Helpers
--
-- All SECURITY DEFINER: they read `user_roles` and `journeys`, both of which are
-- themselves RLS-protected. Without definer's rights a policy that calls them would
-- recurse into the policy it is evaluating.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function has_role(p_role ops_role_enum)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = (select auth.uid()) and role = p_role
  );
$$;

comment on function has_role(ops_role_enum) is
  'True when the current user holds this Ops role. TRD §4.9 / Day 4 helper.';

create or replace function has_any_role(variadic p_roles ops_role_enum[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles
    where user_id = (select auth.uid()) and role = any(p_roles)
  );
$$;

/** Any Ops role at all — used for the shared read access Ops work requires. */
create or replace function is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from user_roles where user_id = (select auth.uid()));
$$;

create or replace function owns_journey(p_journey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from journeys
    where id = p_journey_id
      and owner_user_id = (select auth.uid())
      and deleted_at is null
  );
$$;

create or replace function owns_journey_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from journey_items i
    join journeys j on j.id = i.journey_id
    where i.id = p_item_id
      and j.owner_user_id = (select auth.uid())
      and j.deleted_at is null
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 1 — locales: readable by everyone; only admin edits
-- ══════════════════════════════════════════════════════════════════════════════

grant select on locales to anon, authenticated;
grant insert, update, delete on locales to authenticated;

create policy locales_read_all on locales
  for select to anon, authenticated using (true);

create policy locales_admin_write on locales
  for all to authenticated using (has_role('admin')) with check (has_role('admin'));

-- ui_strings is translation infrastructure, not traveler-facing: next-intl JSON is built
-- from it server-side. Translators and admins edit; every Ops role may read.
grant select, insert, update, delete on ui_strings to authenticated;

create policy ui_strings_ops_read on ui_strings
  for select to authenticated using (is_ops());

create policy ui_strings_translator_write on ui_strings
  for all to authenticated
  using (has_any_role('translator', 'admin'))
  with check (has_any_role('translator', 'admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 2 — knowledge, sources, trust, pipeline, versions, audit, tasks
--
-- Anonymous: none. Authenticated traveler: none (they read `v_published_*`).
-- Ops: read for any role; write per the AUTHORIZATION_MODEL permission map.
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  -- Knowledge tables that researchers and editors draft, and every Ops role can read.
  knowledge_tables text[] := array[
    'destinations', 'circuits', 'circuit_destinations', 'destination_links',
    'places', 'routes', 'route_places', 'accessibility_records',
    'experiences', 'availability_rules', 'transport_connections',
    'guidance_blocks', 'phrases', 'advisories',
    'live_feed_configs', 'live_feed_readings', 'travel_estimates',
    'entity_media'
  ];
begin
  foreach t in array knowledge_tables loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);

    execute format(
      'create policy %I on %I for select to authenticated using (is_ops())',
      t || '_ops_read', t
    );
    -- Researchers and editors draft content. Moving a row to `published` is a workflow
    -- action gated by the approve/publish function in B-012, not by a broader policy.
    execute format(
      'create policy %I on %I for insert to authenticated '
      'with check (has_any_role(''researcher'', ''editor'', ''admin''))',
      t || '_ops_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated '
      'using (has_any_role(''researcher'', ''editor'', ''approver'', ''admin'')) '
      'with check (has_any_role(''researcher'', ''editor'', ''approver'', ''admin''))',
      t || '_ops_update', t
    );
    -- Hard delete is admin-only; the normal path is a soft delete via update.
    execute format(
      'create policy %I on %I for delete to authenticated using (has_role(''admin''))',
      t || '_admin_delete', t
    );
  end loop;
end;
$$;

-- Sources registry: researchers register them, admins administer them (permission map).
grant select, insert, update, delete on sources to authenticated;

create policy sources_ops_read on sources
  for select to authenticated using (is_ops());
create policy sources_write on sources
  for insert to authenticated
  with check (has_any_role('researcher', 'editor', 'admin'));
create policy sources_update on sources
  for update to authenticated
  using (has_any_role('researcher', 'editor', 'admin'))
  with check (has_any_role('researcher', 'editor', 'admin'));
create policy sources_admin_delete on sources
  for delete to authenticated using (has_role('admin'));

-- Trust records are written by the people who review and verify.
grant select, insert, update, delete on trust_records to authenticated;

create policy trust_records_ops_read on trust_records
  for select to authenticated using (is_ops());
create policy trust_records_write on trust_records
  for insert to authenticated
  with check (has_any_role('reviewer', 'verifier', 'editor', 'admin'));
create policy trust_records_update on trust_records
  for update to authenticated
  using (has_any_role('reviewer', 'verifier', 'editor', 'admin'))
  with check (has_any_role('reviewer', 'verifier', 'editor', 'admin'));
create policy trust_records_admin_delete on trust_records
  for delete to authenticated using (has_role('admin'));

-- Ingestion pipeline (M3, B-029). Readable by Ops now so the queues can be built; writes
-- come from Edge Functions under the service role.
do $$
declare
  t text;
  pipeline_tables text[] := array[
    'ingestion_jobs', 'source_captures', 'ai_extractions', 'change_candidates', 'conflicts'
  ];
begin
  foreach t in array pipeline_tables loop
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format(
      'create policy %I on %I for select to authenticated using (is_ops())',
      t || '_ops_read', t
    );
    execute format(
      'create policy %I on %I for insert to authenticated '
      'with check (has_any_role(''researcher'', ''reviewer'', ''verifier'', ''editor'', ''admin''))',
      t || '_ops_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated '
      'using (has_any_role(''reviewer'', ''verifier'', ''editor'', ''admin'')) '
      'with check (has_any_role(''reviewer'', ''verifier'', ''editor'', ''admin''))',
      t || '_ops_update', t
    );
  end loop;
end;
$$;

/*
 * History and audit are APPEND-ONLY to everyone, including admins.
 *
 * There is deliberately no INSERT, UPDATE or DELETE policy: rows arrive only through
 * SECURITY DEFINER triggers (record_entity_version) or the service role. An audit trail
 * an operator can edit is not an audit trail.
 */
grant select on entity_versions, audit_log to authenticated;

create policy entity_versions_ops_read on entity_versions
  for select to authenticated using (is_ops());
create policy audit_log_ops_read on audit_log
  for select to authenticated using (has_any_role('admin', 'approver'));

-- Work queue: every Ops role sees the queue; the assignee or an admin closes an item.
grant select, insert, update on review_tasks to authenticated;

create policy review_tasks_ops_read on review_tasks
  for select to authenticated using (is_ops());
create policy review_tasks_ops_insert on review_tasks
  for insert to authenticated with check (is_ops());
create policy review_tasks_assignee_update on review_tasks
  for update to authenticated
  using (has_role('admin') or assigned_to = (select auth.uid()) or assigned_to is null)
  with check (has_role('admin') or assigned_to = (select auth.uid()) or assigned_to is null);

-- ══════════════════════════════════════════════════════════════════════════════
-- Media — a §4.9 gap filled conservatively (see D-033)
--
-- Travelers must resolve images to render any published content, but `uploaded_by`
-- identifies an Ops user. The column is withheld from anon/authenticated by a
-- column-level grant, so the identity is unreachable rather than merely unselected.
-- ══════════════════════════════════════════════════════════════════════════════

grant select (
  id, storage_path, media_type, width, height, caption_i18n, credit, licence,
  created_at, updated_at, deleted_at
) on media_assets to anon, authenticated;
grant insert, update, delete on media_assets to authenticated;

create policy media_assets_public_read on media_assets
  for select to anon, authenticated using (deleted_at is null);
create policy media_assets_ops_write on media_assets
  for insert to authenticated with check (has_any_role('media', 'editor', 'admin'));
create policy media_assets_ops_update on media_assets
  for update to authenticated
  using (has_any_role('media', 'editor', 'admin'))
  with check (has_any_role('media', 'editor', 'admin'));
create policy media_assets_admin_delete on media_assets
  for delete to authenticated using (has_role('admin'));

-- The join table carries no identity, so it is readable outright.
grant select on entity_media to anon;
create policy entity_media_public_read on entity_media
  for select to anon, authenticated using (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 3 — profiles and personal data
-- ══════════════════════════════════════════════════════════════════════════════

grant select, insert, update on profiles to authenticated;

create policy profiles_own_read on profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_own_insert on profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_own_update on profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- §4.9: admin may read `profiles` — and only profiles.
create policy profiles_admin_read on profiles
  for select to authenticated using (has_role('admin'));

/*
 * traveler_profiles — SENSITIVE (PRD-PRIV-002, PRD §10).
 *
 * Owner-only, with NO Ops policy of any kind, not even for admin. Mobility and age band
 * exist solely so the engine can size buffers and physical load; no Ops query, export,
 * analytics path or share page may ever reach them. The absence of a policy here IS the
 * enforcement mechanism (AUTHORIZATION_MODEL "Sensitive-data guarantees") — adding one
 * later would silently break that guarantee, so do not.
 */
grant select, insert, update, delete on traveler_profiles to authenticated;

create policy traveler_profiles_own_all on traveler_profiles
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

grant select, insert, delete on saved_places to authenticated;

create policy saved_places_own_all on saved_places
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert on personalization_signals to authenticated;

create policy personalization_signals_own_all on personalization_signals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 4 — journeys and their children
--
-- Ops has no access at all: "none (aggregate counts via RPC only)".
-- Guest drafts (owner_user_id null, device_draft_id set) are NOT reachable here — they
-- live in the browser until sign-in claims them, so no policy can leak one.
-- ══════════════════════════════════════════════════════════════════════════════

grant select, insert, update, delete on journeys to authenticated;

create policy journeys_own_all on journeys
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

do $$
declare
  t text;
  -- Children keyed directly by journey_id.
  child_tables text[] := array[
    'journey_destinations', 'journey_travelers', 'journey_items',
    'journey_change_events', 'prepare_tasks', 'journey_records', 'journey_shares'
  ];
begin
  foreach t in array child_tables loop
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (owns_journey(journey_id)) with check (owns_journey(journey_id))',
      t || '_own_all', t
    );
  end loop;
end;
$$;

-- Keyed by item rather than journey, so they resolve ownership one hop further out.
grant select, insert, update, delete on journey_item_dependencies to authenticated;

create policy journey_item_dependencies_own_all on journey_item_dependencies
  for all to authenticated
  using (owns_journey_item(item_id) and owns_journey_item(after_item_id))
  with check (owns_journey_item(item_id) and owns_journey_item(after_item_id));

grant select, insert, update, delete on journey_item_notes to authenticated;

create policy journey_item_notes_own_all on journey_item_notes
  for all to authenticated
  using (owns_journey_item(item_id) and (select auth.uid()) = user_id)
  with check (owns_journey_item(item_id) and (select auth.uid()) = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 5 — user reports
--
-- "support/verifier/editor/admin read/update (reporter_hash only)". That is enforced by
-- withholding the `user_id` column from `authenticated` entirely: neither the reporter
-- nor an operator can select it, while RLS still filters rows by it (policy expressions
-- are evaluated by the system and are not subject to column grants). Ops therefore sees
-- `reporter_hash` and nothing that identifies the person.
-- ══════════════════════════════════════════════════════════════════════════════

grant select (
  id, reporter_hash, report_type, entity_table, entity_id, field_name, description,
  media_id, journey_id, locale, client_created_at, status, resolution_note,
  resolved_by, resolved_at, notified_user, created_at, updated_at
) on user_reports to authenticated;
grant insert on user_reports to authenticated;
grant update (status, resolution_note, resolved_by, resolved_at, notified_user)
  on user_reports to authenticated;

create policy user_reports_own_read on user_reports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_reports_own_insert on user_reports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_reports_ops_read on user_reports
  for select to authenticated
  using (has_any_role('support', 'verifier', 'editor', 'admin'));
create policy user_reports_ops_update on user_reports
  for update to authenticated
  using (has_any_role('support', 'verifier', 'editor', 'admin'))
  with check (has_any_role('support', 'verifier', 'editor', 'admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 6 — notifications (own rows; no Ops access)
-- ══════════════════════════════════════════════════════════════════════════════

grant select, update on notifications to authenticated;

create policy notifications_own_read on notifications
  for select to authenticated using ((select auth.uid()) = user_id);
-- Travelers mark notifications read; the sender writes them under the service role.
create policy notifications_own_update on notifications
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on notification_subscriptions to authenticated;

create policy notification_subscriptions_own_all on notification_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- §4.9 row 7 — analytics: insert-only for everyone, admin reads
--
-- Insert-only is the point: a client that could read this table could correlate events
-- across sessions, which is exactly what the no-PII design is meant to prevent.
-- ══════════════════════════════════════════════════════════════════════════════

grant insert on analytics_events to anon, authenticated;
grant select on analytics_events to authenticated;

create policy analytics_events_insert_all on analytics_events
  for insert to anon, authenticated with check (true);
create policy analytics_events_admin_read on analytics_events
  for select to authenticated using (has_role('admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- Feature flags — a §4.9 gap filled conservatively (see D-033)
--
-- Flags gate client UI, so they must be client-readable; they hold no user data. Only
-- admins may change them.
-- ══════════════════════════════════════════════════════════════════════════════

grant select on feature_flags to anon, authenticated;
grant insert, update, delete on feature_flags to authenticated;

create policy feature_flags_read_all on feature_flags
  for select to anon, authenticated using (true);
create policy feature_flags_admin_write on feature_flags
  for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- ══════════════════════════════════════════════════════════════════════════════
-- user_roles — readable by its owner and by admins; only admins grant roles.
--
-- A user must be able to read their own roles for the Ops shell to decide what to show,
-- but nobody may grant themselves one: the write policy requires an existing admin.
-- ══════════════════════════════════════════════════════════════════════════════

grant select on user_roles to authenticated;
grant insert, update, delete on user_roles to authenticated;

create policy user_roles_own_read on user_roles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_roles_admin_read on user_roles
  for select to authenticated using (has_role('admin'));
create policy user_roles_admin_write on user_roles
  for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));
