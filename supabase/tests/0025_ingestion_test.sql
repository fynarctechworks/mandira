-- pgTAP: the ingestion pipeline cannot become a way to publish (B-029, PRD F17/F18).
--
-- This file exists for one assertion above all the others: **a Review-queue decision must
-- not change anything a traveler can see.** If it could, a source quietly rewriting its own
-- page would rewrite what we tell people standing at a temple gate — which is the single
-- thing the whole trust model exists to prevent. Everything else here is supporting work.
--
-- The rest guards the two other ways this feature could go wrong: raw captures leaking to
-- someone who should not read them (a capture is an arbitrary third-party page we chose to
-- store), and duplicate candidates making the queue untrustworthy.

begin;
select plan(19);

-- ── Identity helpers ────────────────────────────────────────────────────────
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

create function test_become_postgres() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$fn$;

-- ── An operator of each relevant role, and a traveler who is none of them ───
insert into auth.users (id, instance_id, aud, role, email) values
  ('d1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingest-reviewer@ops.test'),
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingest-support@ops.test'),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingest-traveler@ops.test'),
  ('d1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ingest-researcher@ops.test');

insert into user_roles (user_id, role) values
  ('d1000000-0000-4000-8000-000000000001', 'reviewer'),
  -- Support reads the Reports queue and nothing else; it is the role most likely to be
  -- wrongly given a write here, so it is the one the denials are written against.
  ('d1000000-0000-4000-8000-000000000002', 'support'),
  ('d1000000-0000-4000-8000-000000000004', 'researcher');

insert into sources (id, name, source_type, tier, url, ingestion_method, status)
values ('d2000000-0000-4000-8000-000000000001', 'Devagiri temple office (fixture)',
        'official_authority', 'T1', 'https://temple.example.invalid/timings',
        'url_monitor', 'active');

insert into ingestion_jobs (id, source_id, kind, status)
values ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
        'scheduled', 'succeeded');

insert into source_captures (id, source_id, storage_path, content_hash, ingestion_job_id)
values ('d4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
        'd2000000-0000-4000-8000-000000000001/abc.txt', 'abc',
        'd3000000-0000-4000-8000-000000000001');

-- A published experience whose timing cites that source, with the excerpt an operator read.
insert into destinations (id, slug, name_i18n, status)
values ('d5000000-0000-4000-8000-000000000001', 'ingest-fixture-dest',
        '{"en":"Ingestion fixture (fixture)"}'::jsonb, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, status)
values ('d5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001',
        'ingest-fixture-temple', '{"en":"Fixture temple (fixture)"}'::jsonb,
        'temple', 'published');

insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type, status)
values ('d6000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001',
        'd5000000-0000-4000-8000-000000000002',
        'ingest-fixture-aarti', '{"en":"Evening aarti (fixture)"}'::jsonb, 'aarti', 'published');

insert into trust_records
  (entity_table, entity_id, field_name, source_id, source_tier,
   verification_status, evidence_excerpt, verified_at)
values ('experiences', 'd6000000-0000-4000-8000-000000000001', 'name_i18n',
        'd2000000-0000-4000-8000-000000000001', 'T1', 'verified',
        'Evening aarti at 18:30', now());

-- ══════════════════════════════════════════════════════════════════════════════
-- Raising candidates
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_postgres();

select lives_ok(
  $$ select open_change_candidate(
       'experiences', 'd6000000-0000-4000-8000-000000000001', 'name_i18n',
       'd2000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
       'Evening aarti at 18:30') $$,
  'a candidate can be opened for a published field');

select is(
  (select new_value from change_candidates
    where entity_id = 'd6000000-0000-4000-8000-000000000001'),
  null,
  'and new_value is null — detection knows what vanished, not what replaced it');

select is(
  (select excerpt from change_candidates
    where entity_id = 'd6000000-0000-4000-8000-000000000001'),
  'Evening aarti at 18:30',
  'the excerpt is carried verbatim (PRD-OPS-SRC-004)');

-- Twice, because the cron and a "Run now" tap will land on the same field.
select lives_ok(
  $$ select open_change_candidate(
       'experiences', 'd6000000-0000-4000-8000-000000000001', 'name_i18n',
       'd2000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001',
       'Evening aarti at 18:30') $$,
  'opening the same candidate again is allowed');

select is(
  (select count(*)::int from change_candidates
    where entity_id = 'd6000000-0000-4000-8000-000000000001'),
  1,
  'and produces no second row — a queue with duplicates is a queue nobody trusts');

-- ══════════════════════════════════════════════════════════════════════════════
-- THE assertion: a decision cannot publish
-- ══════════════════════════════════════════════════════════════════════════════
select test_become('d1000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select decide_change_candidate(
       (select id from change_candidates
         where entity_id = 'd6000000-0000-4000-8000-000000000001'),
       'accept') $$,
  'a reviewer can accept a candidate');

select test_become_postgres();

select is(
  (select name_i18n ->> 'en' from experiences
    where id = 'd6000000-0000-4000-8000-000000000001'),
  'Evening aarti (fixture)',
  'accepting did NOT touch the knowledge it points at');

select is(
  (select verification_status::text from trust_records
    where entity_id = 'd6000000-0000-4000-8000-000000000001'),
  'verified',
  'nor the trust record — correcting a fact stays a separate edit through the gate');

select is(
  (select status from experiences where id = 'd6000000-0000-4000-8000-000000000001'),
  'published',
  'nor the entity''s publish status');

select is(
  (select status::text from change_candidates
    where entity_id = 'd6000000-0000-4000-8000-000000000001'),
  'done',
  'what it DID change is the candidate, which is the whole job');

-- ══════════════════════════════════════════════════════════════════════════════
-- Who may decide, and on what terms
-- ══════════════════════════════════════════════════════════════════════════════
insert into change_candidates (id, entity_table, entity_id, field_name, source_id, excerpt)
values ('d7000000-0000-4000-8000-000000000002', 'experiences',
        'd6000000-0000-4000-8000-000000000001', 'duration_likely_minutes',
        'd2000000-0000-4000-8000-000000000001', 'about 45 minutes');

select test_become('d1000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ select decide_change_candidate('d7000000-0000-4000-8000-000000000002', 'reject') $$,
  '23514',
  null,
  'a rejection without a reason is refused — a queue that forgets why raises it again');

select throws_ok(
  $$ select decide_change_candidate('d7000000-0000-4000-8000-000000000002', 'publish') $$,
  '22023',
  null,
  'and "publish" is not a decision this function knows how to make');

select test_become('d1000000-0000-4000-8000-000000000002');

select throws_ok(
  $$ select decide_change_candidate('d7000000-0000-4000-8000-000000000002', 'accept') $$,
  '42501',
  null,
  'support cannot decide a candidate, however the UI is reached');

select test_become('d1000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ select decide_change_candidate('d7000000-0000-4000-8000-000000000002', 'accept') $$,
  '42501',
  null,
  'and a traveler with no Ops role certainly cannot');

select is_empty(
  $$ select 1 from change_candidates
      where id = 'd7000000-0000-4000-8000-000000000002' $$,
  'a traveler cannot even see that a candidate exists');

-- request_verify hands the field to somebody who will go and look.
select test_become('d1000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ select decide_change_candidate(
       'd7000000-0000-4000-8000-000000000002', 'request_verify', 'Page no longer lists it.') $$,
  'a reviewer can send a candidate to Verify instead of guessing');

select test_become_postgres();

select isnt_empty(
  $$ select 1 from review_tasks
      where task_type = 'verify'
        and entity_id = 'd6000000-0000-4000-8000-000000000001'
        and field_name = 'duration_likely_minutes' $$,
  'which opens a verify task rather than deciding for them');

-- ══════════════════════════════════════════════════════════════════════════════
-- Captures are evidence, not public reading
-- ══════════════════════════════════════════════════════════════════════════════
select test_become_anon();

select throws_ok(
  $$ select 1 from source_captures $$,
  '42501',
  null,
  'anonymous has no grant on source_captures at all');

select test_become('d1000000-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from source_captures $$,
  'and a signed-in traveler sees none — a capture is an arbitrary page we chose to store');

select * from finish();
rollback;
