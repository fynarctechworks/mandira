-- pgTAP: a disagreement between sources reaches the traveler, and resolving it does not
-- edit knowledge (0028, PRD-OPS-SRC-005, PRD-OPS-WF-003).
--
-- Two claims are being guarded, and the second is the one that would be catastrophic.
--
--   1. Raising a conflict must reach a TRAVELER, not just a queue. `conflict_flag` drops
--      the field to low confidence through `derive_confidence`, and the published views
--      carry it. A conflict that only Ops can see is a field still being shown as certain
--      to somebody standing in front of it.
--   2. Resolving must NOT change the value. If it could, whichever source shouted loudest
--      would become the truth — the same rule the Reports queue (D-127) and the Review
--      queue (D-140) are built on.

begin;
select plan(18);

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

-- ── A verifier, a researcher who may not resolve, and a traveler ────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('aa000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'conflict-verifier@ops.test'),
  ('aa000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'conflict-researcher@ops.test'),
  ('aa000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'conflict-traveler@journeys.test');

insert into user_roles (user_id, role) values
  ('aa000000-0000-4000-8000-000000000001', 'verifier'),
  ('aa000000-0000-4000-8000-000000000002', 'researcher');

insert into destinations (id, slug, name_i18n, status)
values ('ab000000-0000-4000-8000-000000000001', 'conflict-fixture-dest',
        '{"en":"Conflict fixture (fixture)"}'::jsonb, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, status,
                    opening_schedule, closure_rules_i18n, entry_requirements_i18n)
values ('ac000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001',
        'conflict-fixture-temple', '{"en":"Contested temple (fixture)"}'::jsonb,
        'temple', 'published',
        '{"kind":"daily","open":"06:00","close":"20:00"}'::jsonb,
        '{"en":"Closed on Mondays"}'::jsonb, '{"en":"No entry fee"}'::jsonb);

insert into sources (id, name, source_type, tier, status) values
  ('ad000000-0000-4000-8000-000000000001', 'Temple office (fixture)',
   'official_authority', 'T1', 'active'),
  ('ad000000-0000-4000-8000-000000000002', 'Tourism board (fixture)',
   'government', 'T2', 'active');

-- Verified against the temple office, high confidence, and nothing disputed yet.
insert into trust_records
  (entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, verified_at)
values
  ('places', 'ac000000-0000-4000-8000-000000000001', 'opening_schedule',
   'ad000000-0000-4000-8000-000000000001', 'T1', 'verified', now()),
  -- A second critical field with its own record. Every published critical field has one —
  -- the gate refuses publication otherwise — so the fixture has to look like that too, or
  -- the flag assertions below would be testing a state that cannot exist.
  ('places', 'ac000000-0000-4000-8000-000000000001', 'closure_rules_i18n',
   'ad000000-0000-4000-8000-000000000001', 'T1', 'verified', now());

select test_become_postgres();

select is(
  (select confidence::text from trust_records
    where entity_id = 'ac000000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule'),
  'high',
  'the field starts as high confidence — T1, verified, fresh');

-- ══════════════════════════════════════════════════════════════════════════════
-- Raising it
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('aa000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ select open_conflict('places', 'ac000000-0000-4000-8000-000000000001', 'opening_schedule',
       '[{"source_id":"ad000000-0000-4000-8000-000000000001","value":"20:00"},
         {"source_id":"ad000000-0000-4000-8000-000000000002","value":"18:00"}]'::jsonb) $$,
  '42501',
  null,
  'a researcher cannot open a conflict — it is a verifier''s judgement');

select test_become('aa000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select open_conflict('places', 'ac000000-0000-4000-8000-000000000001', 'opening_schedule',
       '[{"source_id":"ad000000-0000-4000-8000-000000000001","value":"20:00"}]'::jsonb) $$,
  '23514',
  null,
  'one value is not a conflict — that is a correction, and corrections go through the gate');

select lives_ok(
  $$ select open_conflict('places', 'ac000000-0000-4000-8000-000000000001', 'opening_schedule',
       '[{"source_id":"ad000000-0000-4000-8000-000000000001","tier":"T1","value":"closes 20:00"},
         {"source_id":"ad000000-0000-4000-8000-000000000002","tier":"T2","value":"closes 18:00"}]'::jsonb) $$,
  'a verifier opens it with both competing values');

-- Twice, because two operators can notice the same disagreement in the same week.
select lives_ok(
  $$ select open_conflict('places', 'ac000000-0000-4000-8000-000000000001', 'opening_schedule',
       '[{"source_id":"ad000000-0000-4000-8000-000000000001","value":"closes 20:00"},
         {"source_id":"ad000000-0000-4000-8000-000000000002","value":"closes 18:00"}]'::jsonb) $$,
  'opening the same conflict again is allowed');

select test_become_postgres();

select is(
  (select count(*)::int from conflicts
    where entity_id = 'ac000000-0000-4000-8000-000000000001' and status = 'open'),
  1,
  'and produces one open conflict, not a rival to the first');

-- ── The half that reaches a traveler ───────────────────────────────────────
select ok(
  (select conflict_flag from trust_records
    where entity_id = 'ac000000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule'),
  'the field is flagged as contested');

select is(
  (select confidence::text from trust_records
    where entity_id = 'ac000000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule'),
  'low',
  'which drops it to LOW confidence — a traveler stops being told it is certain');

select isnt_empty(
  $$ select 1 from review_tasks
      where task_type = 'conflict'
        and entity_id = 'ac000000-0000-4000-8000-000000000001'
        and status = 'open' $$,
  'and somebody is given the job of settling it');

-- ══════════════════════════════════════════════════════════════════════════════
-- Resolving it
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('aa000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select resolve_conflict(
       (select id from conflicts where entity_id = 'ac000000-0000-4000-8000-000000000001'),
       'winner', '') $$,
  '23514',
  null,
  'a resolution without a reason is refused — the next person needs to know why');

select throws_ok(
  $$ select resolve_conflict(
       (select id from conflicts where entity_id = 'ac000000-0000-4000-8000-000000000001'),
       'winner', 'The office is the authority.') $$,
  '23514',
  null,
  'and choosing a winner means naming which source won');

-- Escalating is a real answer, and it deliberately KEEPS the flag.
select lives_ok(
  $$ select resolve_conflict(
       (select id from conflicts where entity_id = 'ac000000-0000-4000-8000-000000000001'),
       'escalate', 'Neither source will confirm; asking the temple directly.') $$,
  'a verifier can escalate rather than guess');

select test_become_postgres();

select ok(
  (select conflict_flag from trust_records
    where entity_id = 'ac000000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule'),
  'escalating KEEPS the flag — an unsettled disagreement must keep reading as uncertain');

-- ── Settling it properly ───────────────────────────────────────────────────
select test_become('aa000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select open_conflict('places', 'ac000000-0000-4000-8000-000000000001', 'closure_rules_i18n',
       '[{"source_id":"ad000000-0000-4000-8000-000000000001","value":"Mondays"},
         {"source_id":"ad000000-0000-4000-8000-000000000002","value":"Tuesdays"}]'::jsonb) $$,
  'a second field is contested');

select lives_ok(
  $$ select resolve_conflict(
       (select id from conflicts
         where entity_id = 'ac000000-0000-4000-8000-000000000001'
           and field_name = 'closure_rules_i18n'),
       'winner', 'The temple office keeps the closure calendar.',
       'ad000000-0000-4000-8000-000000000001') $$,
  'and settled by naming a winner with a reason');

select test_become_postgres();

select is(
  (select conflict_flag from trust_records
    where entity_id = 'ac000000-0000-4000-8000-000000000001'
      and field_name = 'closure_rules_i18n'),
  false,
  'which clears the flag on that field');

-- ── THE assertion: resolving changed no knowledge ──────────────────────────
select is(
  (select closure_rules_i18n ->> 'en' from places
    where id = 'ac000000-0000-4000-8000-000000000001'),
  'Closed on Mondays',
  'and the value itself is untouched — correcting it is a separate edit through the gate');

select is(
  (select status from places where id = 'ac000000-0000-4000-8000-000000000001'),
  'published',
  'nor did resolving publish or unpublish anything');

select * from finish();
rollback;
