-- pgTAP: TRD §4.4–§4.7 structure, constraints and search/geo infrastructure.

begin;
select plan(26);

-- ── Tables present ────────────────────────────────────────────────────────────
select has_table('public', 'destinations', 'destinations exists');
select has_table('public', 'places', 'places exists');
select has_table('public', 'experiences', 'experiences exists');
select has_table('public', 'availability_rules', 'availability_rules exists');
select has_table('public', 'routes', 'routes exists');
select has_table('public', 'transport_connections', 'transport_connections exists');
select has_table('public', 'journeys', 'journeys exists');
select has_table('public', 'journey_items', 'journey_items exists');
select has_table('public', 'traveler_profiles', 'traveler_profiles exists');
select has_table('public', 'user_reports', 'user_reports exists');
select has_table('public', 'analytics_events', 'analytics_events exists');

-- ── RLS still universal after 40+ new tables ──────────────────────────────────
select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table still has RLS enabled'
);

-- ── Search & geo infrastructure (TRD-DB-005) ──────────────────────────────────
select has_column('public', 'destinations', 'search_tsv', 'destinations.search_tsv exists');
select has_column('public', 'places', 'embedding', 'places.embedding vector column exists');
select has_index('public', 'places', 'places_location_idx', 'places.location has a GiST index');
select has_index('public', 'experiences', 'experiences_search_idx', 'experiences.search_tsv has a GIN index');

-- search_tsv must cover every locale, not just English, or te/hi search silently fails.
insert into destinations (id, slug, name_i18n, status)
values (
  '10000000-0000-0000-0000-000000000001',
  'test-destination',
  '{"en":"Riverbank","te":"నదీతీరం","hi":"नदीतट"}'::jsonb,
  'draft'
);

select isnt_empty(
  $$ select 1 from destinations
      where id = '10000000-0000-0000-0000-000000000001'
        and search_tsv @@ to_tsquery('simple', 'Riverbank') $$,
  'search_tsv indexes the English name'
);
select isnt_empty(
  $$ select 1 from destinations
      where id = '10000000-0000-0000-0000-000000000001'
        and search_tsv @@ to_tsquery('simple', 'నదీతీరం') $$,
  'search_tsv indexes the Telugu name (locale-agnostic i18n_text)'
);

-- ── Constraints that encode product rules ─────────────────────────────────────

-- PRD-PLAN-006: a FIXED item is the return guard's anchor; it must have a time.
insert into journeys (id, device_draft_id, title)
values ('20000000-0000-0000-0000-000000000001', 'device-1', 'Test journey');

select throws_ok(
  $$ insert into journey_items (journey_id, item_type, tier)
     values ('20000000-0000-0000-0000-000000000001', 'experience', 'fixed') $$,
  '23514',
  null,
  'a FIXED journey item cannot be created without fixed_start_at'
);

select lives_ok(
  $$ insert into journey_items (journey_id, item_type, tier, fixed_start_at)
     values ('20000000-0000-0000-0000-000000000001', 'experience', 'fixed', now()) $$,
  'a FIXED item with a time is accepted'
);

select lives_ok(
  $$ insert into journey_items (journey_id, item_type, tier)
     values ('20000000-0000-0000-0000-000000000001', 'experience', 'optional') $$,
  'a non-FIXED item needs no fixed_start_at'
);

-- TRD §4.4: an experience hangs off exactly one of place or route.
select throws_ok(
  $$ insert into experiences (destination_id, slug, experience_type)
     values ('10000000-0000-0000-0000-000000000001', 'no-anchor', 'darshan') $$,
  '23514',
  null,
  'an experience with neither place nor route is rejected'
);

-- A journey must belong to a user or a device draft, never neither.
select throws_ok(
  $$ insert into journeys (title) values ('orphan') $$,
  '23514',
  null,
  'a journey with no owner and no device draft is rejected'
);

-- Duration triples must be ordered; an inverted range would break engine scheduling.
select throws_ok(
  $$ insert into places (destination_id, slug, place_type,
                         visit_duration_min_minutes, visit_duration_likely_minutes,
                         visit_duration_max_minutes)
     values ('10000000-0000-0000-0000-000000000001', 'bad-durations', 'temple', 90, 60, 30) $$,
  '23514',
  null,
  'min > likely > max durations are rejected'
);

/*
 * TRD-DB-004: every publishable table must record versions, or the approve workflow
 * has gaps in its history. Driving this off the schema rather than a hand-kept list
 * means a table added in a later migration cannot quietly skip it — which is exactly
 * how `circuits` was found to be missing its trigger during B-004.
 */
select is_empty(
  $$ select c.table_name
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'status'
        and c.udt_name = 'publish_status_enum'
        and not exists (
          select 1 from pg_trigger t
          join pg_class cl on cl.oid = t.tgrelid
          where cl.relname = c.table_name
            and t.tgname = c.table_name || '_record_version'
        ) $$,
  'every table with a publish status records entity versions'
);

-- ── Privacy posture (PRD-PRIV-002 / PRD-ANLY-001) ─────────────────────────────
select hasnt_column(
  'public', 'analytics_events', 'user_id',
  'analytics_events has NO user_id column at all, not merely a nullable one'
);

select * from finish();
rollback;
