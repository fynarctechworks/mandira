-- pgTAP: a report is a SIGNAL, never a fact (B-028, PRD F14, PRD-REPT-002).
--
-- The single most important property in this file: nothing a traveler reports can change
-- what another traveler is shown. Reports are tier T5 — the weakest evidence the trust
-- model holds — and they enter a queue for a human to check against a real source.
--
-- If reporting could edit knowledge, three people repeating the same wrong thing would
-- eventually become the truth, and the publish gate would have a hole shaped like a
-- feedback form.

begin;
select plan(11);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_become_anon() returns void
language plpgsql as $fn$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('a9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reporter@reports.test'),
  ('a9000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nosy@reports.test');

-- ── The six types PRD F14 names ─────────────────────────────────────────────
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'report_type_enum'),
  6,
  'report_type_enum carries exactly PRD F14''s six report types'
);

-- ── A guest may NOT report, and that is the schema's decision ────────────────
--
-- Worth pinning because the table's own shape suggests otherwise: `user_id` is nullable and
-- `reporter_hash` exists precisely for a reporter with no account. But no anon policy and
-- no anon grant were ever written, so guest reporting does not work — and the person who
-- notices a gate is shut is exactly the person standing in front of it.
--
-- Raised as OPEN-013 rather than resolved by widening the only anon write surface besides
-- analytics, on a table holding free text, in passing.
select test_become_anon();

select throws_ok(
  $$ insert into user_reports (reporter_hash, report_type, entity_table, entity_id)
     values ('hash-of-a-guest-device', 'closed', 'places',
             'd0000000-0000-4000-8000-00000000f002') $$,
  '42501',
  null,
  'a guest cannot report — no anon policy exists, despite the nullable user_id (OPEN-013)'
);

-- Stronger than an RLS filter: `anon` holds no grant on this table at all, so the read is
-- refused before any policy is consulted.
select throws_ok(
  $$ select 1 from user_reports $$,
  '42501',
  null,
  'and cannot read what anyone else reported'
);

-- ── A report cannot touch knowledge ─────────────────────────────────────────
-- The assertion this whole file exists for.
select throws_ok(
  $$ update places set status = 'archived'
      where id = 'd0000000-0000-4000-8000-00000000f002' $$,
  '42501',
  null,
  'a guest cannot edit the place they reported'
);

select throws_ok(
  $$ insert into trust_records (entity_table, entity_id, field_name, verification_status)
     values ('places', 'd0000000-0000-4000-8000-00000000f002', 'opening_schedule', 'verified') $$,
  '42501',
  null,
  'nor promote their own report into a verified fact'
);

-- ── A signed-in reporter sees their own, and only their own ─────────────────
select test_become('a9000000-0000-4000-8000-000000000001');

insert into user_reports (id, user_id, report_type, entity_table, entity_id)
values ('aa000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000001',
        'timing_changed', 'places', 'd0000000-0000-4000-8000-00000000f002');

select is(
  (select count(*)::int from user_reports),
  1,
  'a signed-in reporter sees their own report'
);

select is(
  (select status from user_reports where id = 'aa000000-0000-4000-8000-000000000002'),
  'new',
  'which starts as new — nothing is auto-resolved and nothing is auto-published'
);

select is(
  (select notified_user from user_reports where id = 'aa000000-0000-4000-8000-000000000002'),
  false,
  'and the reporter has not been told anything yet'
);

-- ── Another traveler ────────────────────────────────────────────────────────
select test_become('a9000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from user_reports $$,
  'another traveler cannot read someone else''s report'
);

-- A reporter cannot resolve their own report either: that is an operator's judgement, and
-- self-resolution would make the queue meaningless.
select test_become('a9000000-0000-4000-8000-000000000001');

update user_reports set status = 'resolved_confirmed_correct'
 where id = 'aa000000-0000-4000-8000-000000000002';

select is(
  (select status from user_reports where id = 'aa000000-0000-4000-8000-000000000002'),
  'new',
  'and a reporter cannot resolve their own report'
);

/*
 * The downgrade rule's own arithmetic (PRD-REPT-004, implemented in 0013).
 *
 * Two reports from the SAME reporter must count as one signal, or one determined person
 * could mark a correct fact "check locally" on their own — which would turn the feedback
 * form into a way to discredit knowledge nobody else disputes.
 */
-- A traveler holds INSERT and no UPDATE, so a filed report cannot be edited afterwards —
-- which is right: a report is what somebody saw at a moment, not a document. So the
-- fixture is built as the superuser rather than by amending what is already there.
reset role;

insert into user_reports (reporter_hash, report_type, entity_table, entity_id, created_at)
values
  ('same-device-hash', 'closed', 'places',
   'd0000000-0000-4000-8000-00000000f003', now()),
  ('same-device-hash', 'timing_changed', 'places',
   'd0000000-0000-4000-8000-00000000f003', now());

select is(
  (select count(distinct reporter_hash)::int
     from user_reports
    where entity_id = 'd0000000-0000-4000-8000-00000000f003'),
  1,
  'two reports from one device count as one reporter, not two'
);

select * from finish();
rollback;
