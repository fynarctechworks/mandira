-- pgTAP: the freshness monitor shows what is rotting, and only that (0027, PRD-OPS-WF-006).
--
-- The failure mode this guards against is quiet: a monitor that shows the wrong rows is not
-- a broken screen, it is a team that believes their knowledge is fresher than it is. So the
-- assertions are mostly about EXCLUSION — a draft's stale field is not in the queue, a
-- non-critical field is not in the queue, and a field with a task open already is marked
-- rather than offered again.

begin;
select plan(16);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_become_postgres() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$fn$;

-- ── A verifier, a researcher, and a traveler ────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('a9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fresh-verifier@ops.test'),
  ('a9000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fresh-researcher@ops.test'),
  ('a9000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fresh-traveler@journeys.test');

insert into user_roles (user_id, role) values
  ('a9000000-0000-4000-8000-000000000001', 'verifier'),
  ('a9000000-0000-4000-8000-000000000002', 'researcher');

insert into destinations (id, slug, name_i18n, status)
values ('b9000000-0000-4000-8000-000000000001', 'fresh-fixture-dest',
        '{"en":"Freshness fixture (fixture)"}'::jsonb, 'published');

-- One published place and one draft, so the queue can be shown to exclude the draft.
insert into places (id, destination_id, slug, name_i18n, place_type, status) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001',
   'fresh-published-temple', '{"en":"Published temple (fixture)"}'::jsonb, 'temple', 'published'),
  ('c9000000-0000-4000-8000-000000000002', 'b9000000-0000-4000-8000-000000000001',
   'fresh-draft-temple', '{"en":"Draft temple (fixture)"}'::jsonb, 'temple', 'draft');

insert into sources (id, name, source_type, tier, status)
values ('d9000000-0000-4000-8000-000000000001', 'Freshness fixture source',
        'official_authority', 'T1', 'active');

-- A stale critical field on the published place: verified seven months ago.
insert into trust_records
  (id, entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at)
values ('e9000000-0000-4000-8000-000000000001', 'places',
        'c9000000-0000-4000-8000-000000000001', 'opening_schedule',
        'd9000000-0000-4000-8000-000000000001', 'T1', 'verified',
        now() - interval '210 days');

-- An aging one: four months.
insert into trust_records
  (id, entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at)
values ('e9000000-0000-4000-8000-000000000002', 'places',
        'c9000000-0000-4000-8000-000000000001', 'closure_rules_i18n',
        'd9000000-0000-4000-8000-000000000001', 'T1', 'verified',
        now() - interval '120 days');

-- Fresh, but with a `valid_until` a fortnight away — the "expiring within 30 days" case,
-- which is about the source's own promise rather than about age.
insert into trust_records
  (id, entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at, valid_until)
values ('e9000000-0000-4000-8000-000000000003', 'places',
        'c9000000-0000-4000-8000-000000000001', 'entry_requirements_i18n',
        'd9000000-0000-4000-8000-000000000001', 'T1', 'verified',
        now(), current_date + 14);

-- A NON-critical field, stale. It must not appear: the monitor is about what the publish
-- gate depends on, and widening it to every field would bury the ones that matter.
insert into trust_records
  (id, entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at)
values ('e9000000-0000-4000-8000-000000000004', 'places',
        'c9000000-0000-4000-8000-000000000001', 'hours_note_i18n',
        'd9000000-0000-4000-8000-000000000001', 'T1', 'verified',
        now() - interval '300 days');

-- A stale critical field on the DRAFT place. Also excluded: nobody is being shown it.
insert into trust_records
  (id, entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at)
values ('e9000000-0000-4000-8000-000000000005', 'places',
        'c9000000-0000-4000-8000-000000000002', 'opening_schedule',
        'd9000000-0000-4000-8000-000000000001', 'T1', 'verified',
        now() - interval '300 days');

-- ══════════════════════════════════════════════════════════════════════════════
-- What the monitor shows
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('a9000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001')),
  3,
  'three critical fields on the published place, and only those');

select is(
  (select entity_label from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001') limit 1),
  'Published temple (fixture)',
  'each row is named by something an operator can read');

select is_empty(
  $$ select 1 from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001')
      where field_name = 'hours_note_i18n' $$,
  'a non-critical field is not in the queue, however stale it is');

select is_empty(
  $$ select 1 from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001')
      where entity_id = 'c9000000-0000-4000-8000-000000000002' $$,
  'nor a draft — a stale field nobody is being shown is not yet anybody''s problem');

-- ── The five filters ───────────────────────────────────────────────────────
select is(
  (select count(*)::int
     from freshness_rows('stale', 'b9000000-0000-4000-8000-000000000001')),
  1,
  'the stale filter finds the one verified seven months ago');

select is(
  (select count(*)::int
     from freshness_rows('aging', 'b9000000-0000-4000-8000-000000000001')),
  1,
  'the aging filter finds the four-month-old one');

select is(
  (select field_name from freshness_rows('expiring30', 'b9000000-0000-4000-8000-000000000001')),
  'entry_requirements_i18n',
  'expiring30 is about valid_until, not about age — a fresh record can still be expiring');

select is(
  (select count(*)::int
     from freshness_rows('conflict', 'b9000000-0000-4000-8000-000000000001')),
  0,
  'nothing is conflicted yet, and the filter says so rather than falling back to everything');

select throws_ok(
  $$ select 1 from freshness_rows('whatever') $$,
  '22023',
  null,
  'an unknown filter is refused rather than silently treated as "all"');

-- ── Worst first ────────────────────────────────────────────────────────────
select is(
  (select freshness::text
     from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001') limit 1),
  'stale',
  'the worst row is first — a monitor sorted otherwise hides what needs doing');

-- ══════════════════════════════════════════════════════════════════════════════
-- Assigning re-verification
-- ══════════════════════════════════════════════════════════════════════════════
select is(
  assign_reverification(array['e9000000-0000-4000-8000-000000000001'::uuid,
                             'e9000000-0000-4000-8000-000000000002'::uuid]),
  2,
  'a verifier assigns two fields for re-verification');

select is(
  assign_reverification(array['e9000000-0000-4000-8000-000000000001'::uuid,
                             'e9000000-0000-4000-8000-000000000002'::uuid]),
  0,
  'and assigning them again creates nothing — one open task per field, never two');

select ok(
  (select has_open_task from freshness_rows('stale', 'b9000000-0000-4000-8000-000000000001')),
  'the monitor marks a field that is already on somebody''s desk');

-- ── Who may do what ────────────────────────────────────────────────────────
select test_become('a9000000-0000-4000-8000-000000000002');

select isnt_empty(
  $$ select 1 from freshness_rows('all', 'b9000000-0000-4000-8000-000000000001') $$,
  'a researcher can see what is going stale');

select throws_ok(
  $$ select assign_reverification(array['e9000000-0000-4000-8000-000000000003'::uuid]) $$,
  '42501',
  null,
  'but cannot put it on somebody else''s desk — assigning is narrower than looking');

select test_become('a9000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ select 1 from freshness_rows('all') $$,
  '42501',
  null,
  'and a traveler cannot read the monitor at all');

select * from finish();
rollback;
