-- pgTAP: the publish gate (PRD-KNOW-003, TRD-ARCH-004, D-010).
--
-- This is the single most important structural guarantee in the schema: unverified or
-- ai_extracted knowledge must be invisible to travelers. These tests drive a place
-- through every gate state rather than asserting the view merely exists.

begin;
select plan(20);

-- ── Views exist ───────────────────────────────────────────────────────────────
select has_view('public', 'v_published_destinations', 'v_published_destinations exists');
select has_view('public', 'v_published_places', 'v_published_places exists');
select has_view('public', 'v_published_experiences', 'v_published_experiences exists');
select has_view('public', 'v_published_availability_rules', 'v_published_availability_rules exists');
select has_view('public', 'v_published_routes', 'v_published_routes exists');
select has_view('public', 'v_published_transport_connections', 'v_published_transport_connections exists');
select has_view('public', 'v_published_guidance_blocks', 'v_published_guidance_blocks exists');
select has_view('public', 'v_published_phrases', 'v_published_phrases exists');
select has_view('public', 'v_published_advisories', 'v_published_advisories exists');

-- ── Fixtures ──────────────────────────────────────────────────────────────────
insert into sources (id, name, source_type, tier)
values ('30000000-0000-0000-0000-000000000001', 'Temple administration', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, status, published_at)
values ('30000000-0000-0000-0000-000000000002', 'gate-test', '{"en":"Gate Test"}'::jsonb,
        'published', now());

insert into places (id, destination_id, slug, name_i18n, place_type, status, published_at)
values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002',
        'main-temple', '{"en":"Main Temple"}'::jsonb, 'temple', 'published', now());

-- A published row with NO trust records on its critical fields must not be visible:
-- PRD F9 requires every published critical field to render a badge, and there is none.
select is_empty(
  $$ select 1 from v_published_places where id = '30000000-0000-0000-0000-000000000003' $$,
  'published place with no critical-field trust is NOT visible'
);

-- Add trust records, but below the gate.
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
values
  ('places', '30000000-0000-0000-0000-000000000003', 'opening_schedule',
   '30000000-0000-0000-0000-000000000001', 'T1', 'ai_extracted'),
  ('places', '30000000-0000-0000-0000-000000000003', 'closure_rules_i18n',
   '30000000-0000-0000-0000-000000000001', 'T1', 'human_reviewed'),
  ('places', '30000000-0000-0000-0000-000000000003', 'entry_requirements_i18n',
   '30000000-0000-0000-0000-000000000001', 'T1', 'human_reviewed');

select is_empty(
  $$ select 1 from v_published_places where id = '30000000-0000-0000-0000-000000000003' $$,
  'a single ai_extracted critical field keeps the whole place invisible'
);

-- Raise the laggard to human_reviewed — the minimum bar.
update trust_records
   set verification_status = 'human_reviewed'
 where entity_table = 'places'
   and entity_id = '30000000-0000-0000-0000-000000000003'
   and field_name = 'opening_schedule';

select isnt_empty(
  $$ select 1 from v_published_places where id = '30000000-0000-0000-0000-000000000003' $$,
  'place becomes visible once every critical field reaches human_reviewed'
);

-- Unpublishing must remove it regardless of how well verified it is.
update places set status = 'draft' where id = '30000000-0000-0000-0000-000000000003';
select is_empty(
  $$ select 1 from v_published_places where id = '30000000-0000-0000-0000-000000000003' $$,
  'status=draft hides the place even with full critical-field trust'
);

update places set status = 'published' where id = '30000000-0000-0000-0000-000000000003';

-- Soft delete must also remove it.
update places set deleted_at = now() where id = '30000000-0000-0000-0000-000000000003';
select is_empty(
  $$ select 1 from v_published_places where id = '30000000-0000-0000-0000-000000000003' $$,
  'soft-deleted place is hidden'
);

update places set deleted_at = null where id = '30000000-0000-0000-0000-000000000003';

-- ── trust jsonb shape (PRD F9) ────────────────────────────────────────────────
update trust_records
   set verification_status = 'verified',
       verified_at = now(),
       valid_until = current_date + 60
 where entity_table = 'places'
   and entity_id = '30000000-0000-0000-0000-000000000003';

select is(
  (select trust -> 'opening_schedule' ->> 'confidence'
     from v_published_places where id = '30000000-0000-0000-0000-000000000003'),
  'high',
  'trust jsonb carries the derived confidence per critical field'
);

select is(
  (select trust -> 'opening_schedule' ->> 'source_tier_label'
     from v_published_places where id = '30000000-0000-0000-0000-000000000003'),
  'Official authority',
  'trust jsonb renders the source tier in words, not the T1 code'
);

-- A conflicted field must still be VISIBLE, flagged low — PRD F9 forbids hiding
-- low-confidence facts to make a page look cleaner.
update trust_records
   set conflict_flag = true
 where entity_table = 'places'
   and entity_id = '30000000-0000-0000-0000-000000000003'
   and field_name = 'opening_schedule';

select is(
  (select trust -> 'opening_schedule' ->> 'confidence'
     from v_published_places where id = '30000000-0000-0000-0000-000000000003'),
  'low',
  'a conflicted critical field stays visible but drops to low confidence'
);

-- ── The views are the traveler's ONLY read surface (TRD-ARCH-004, D-010) ──────
-- Two independent layers protect the base tables: `anon` holds no grant on them at all,
-- and RLS is enabled with no traveler policy. Losing either one alone is not enough to
-- leak drafts, but this asserts the grant layer explicitly.
select ok(
  not has_table_privilege('anon', 'public.places', 'SELECT'),
  'anon has no SELECT grant on the places base table'
);
select ok(
  not has_table_privilege('anon', 'public.destinations', 'SELECT'),
  'anon has no SELECT grant on the destinations base table'
);
select ok(
  has_table_privilege('anon', 'public.v_published_destinations', 'SELECT'),
  'anon CAN select from the published destinations view'
);

select * from finish();
rollback;
