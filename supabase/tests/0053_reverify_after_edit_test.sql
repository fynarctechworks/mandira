-- pgTAP: 0053 — changing a published critical field un-verifies it, opens a re-verify task,
-- and leaves everything else alone.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5300000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verifier@0053.test');
insert into user_roles (user_id, role) values ('f5300000-0000-4000-8000-0000000000a1', 'verifier');

insert into destinations (id, slug, name_i18n, status)
values ('f5310000-0000-4000-8000-000000000001', 't53-dest', '{"en":"T53"}', 'published');

insert into sources (id, name, source_type, tier, status)
values ('f5320000-0000-4000-8000-000000000001', 'T53 authority', 'official_authority', 'T1', 'active');

-- One published place, its hours verified; one draft place, likewise.
insert into places (id, destination_id, slug, name_i18n, place_type, status, address, opening_schedule) values
  ('f5330000-0000-4000-8000-000000000001', 'f5310000-0000-4000-8000-000000000001', 't53-live',
   '{"en":"T53 Live temple"}', 'temple', 'published', 'Old road',
   '{"weekly":{"mon":[["06:00","12:00"]]}}'),
  ('f5330000-0000-4000-8000-000000000002', 'f5310000-0000-4000-8000-000000000001', 't53-draft',
   '{"en":"T53 Draft temple"}', 'temple', 'draft', null,
   '{"weekly":{"mon":[["06:00","12:00"]]}}');

insert into trust_records
  (entity_table, entity_id, field_name, source_id, source_tier, verification_status, verified_at, evidence_excerpt)
values
  ('places', 'f5330000-0000-4000-8000-000000000001', 'opening_schedule',
   'f5320000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '3 days', 'Open 06:00 to 12:00'),
  ('places', 'f5330000-0000-4000-8000-000000000001', 'closure_rules_i18n',
   'f5320000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '3 days', 'Closed on festival days'),
  ('places', 'f5330000-0000-4000-8000-000000000001', 'entry_requirements_i18n',
   'f5320000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '3 days', 'Bring photo ID'),
  ('places', 'f5330000-0000-4000-8000-000000000002', 'opening_schedule',
   'f5320000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '3 days', 'Open 06:00 to 12:00');

create or replace function t53_flag(p_place uuid, p_field text) returns boolean language sql as $$
  select needs_reverification from trust_records
   where entity_table = 'places' and entity_id = p_place and field_name = p_field
$$;

-- ── Nothing is flagged to begin with ─────────────────────────────────────────

select ok(not t53_flag('f5330000-0000-4000-8000-000000000001', 'opening_schedule'),
  'a verified field starts unflagged');

-- ── The edit that used to go unnoticed ───────────────────────────────────────

update places set opening_schedule = '{"weekly":{"mon":[["05:00","11:00"]]}}'
 where id = 'f5330000-0000-4000-8000-000000000001';

select ok(t53_flag('f5330000-0000-4000-8000-000000000001', 'opening_schedule'),
  'changing published opening hours un-verifies them');
select ok(not t53_flag('f5330000-0000-4000-8000-000000000001', 'closure_rules_i18n'),
  'and leaves the fields that did not change alone');
select is(
  (select count(*)::int from review_tasks
    where task_type = 'reverify' and entity_id = 'f5330000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule' and status = 'open'),
  1, 'a re-verify task opens for it');

select is(
  (select count(*)::int from v_published_places where id = 'f5330000-0000-4000-8000-000000000001'),
  1, 'the place stays visible: a traveler still needs it, now with an honest badge');
select ok(
  ((select entity_trust('places', 'f5330000-0000-4000-8000-000000000001'))
     #> '{opening_schedule,needs_reverification}')::text = 'true',
  'and the badge payload says the value changed since it was verified');

-- ── Editing it again does not pile up tasks ──────────────────────────────────

update places set opening_schedule = '{"weekly":{"mon":[["05:30","11:30"]]}}'
 where id = 'f5330000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from review_tasks
    where task_type = 'reverify' and entity_id = 'f5330000-0000-4000-8000-000000000001'
      and field_name = 'opening_schedule' and status = 'open'),
  1, 'a second edit adds no second task');

-- ── What does not count ──────────────────────────────────────────────────────

update places set address = 'New road' where id = 'f5330000-0000-4000-8000-000000000001';
select ok(not t53_flag('f5330000-0000-4000-8000-000000000001', 'closure_rules_i18n'),
  'an ordinary field is not a critical one');

update places set opening_schedule = '{"weekly":{"mon":[["04:00","10:00"]]}}'
 where id = 'f5330000-0000-4000-8000-000000000002';
select ok(not t53_flag('f5330000-0000-4000-8000-000000000002', 'opening_schedule'),
  'a draft is nobody''s plan yet, so editing it flags nothing');

update places set name_i18n = '{"en":"T53 Live temple renamed"}'
 where id = 'f5330000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from review_tasks
    where task_type = 'reverify' and entity_id = 'f5330000-0000-4000-8000-000000000001'
      and status = 'open'),
  1, 'and a rename opens nothing new');

-- ── Verifying again is what clears it ────────────────────────────────────────

update trust_records
   set verified_at = now(), evidence_excerpt = 'Open 05:30 to 11:30'
 where entity_table = 'places' and entity_id = 'f5330000-0000-4000-8000-000000000001'
   and field_name = 'opening_schedule';

select ok(not t53_flag('f5330000-0000-4000-8000-000000000001', 'opening_schedule'),
  'checking the new value against the source clears the flag');

update trust_records set valid_until = now() + interval '90 days'
 where entity_table = 'places' and entity_id = 'f5330000-0000-4000-8000-000000000001'
   and field_name = 'opening_schedule';
select ok(not t53_flag('f5330000-0000-4000-8000-000000000001', 'opening_schedule'),
  'and an unrelated edit to the record does not re-flag it');

select * from finish();
rollback;
