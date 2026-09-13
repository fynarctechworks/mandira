-- 0039 · a reporter's identity never reaches Ops (D-174, PRD §10, PRD-REPT-003)
begin;
select plan(9);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_reset() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''{}''';
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('b9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reporter@privacy.test'),
  ('b9000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'support@privacy.test'),
  ('b9000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'traveler@privacy.test');

insert into user_roles (user_id, role) values
  ('b9000000-0000-4000-8000-000000000002', 'support');

insert into user_reports (id, user_id, reporter_hash, report_type, entity_table, entity_id) values
  ('b9100000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', null,
   'closed', 'places', 'd0000000-0000-4000-8000-00000000f002'),
  ('b9100000-0000-4000-8000-000000000002', null, 'a-guest-device-hash',
   'closed', 'places', 'd0000000-0000-4000-8000-00000000f002');

-- ── Support resolves a traveler's report ──────────────────────────────────────────────
select test_become('b9000000-0000-4000-8000-000000000002');

update user_reports
set status = 'resolved_updated',
    resolved_by = 'b9000000-0000-4000-8000-000000000002',
    resolved_at = now()
where id in ('b9100000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000002');

select is(
  notify_report_resolution('b9100000-0000-4000-8000-000000000001'),
  true,
  'resolving a report queues the notice to whoever filed it'
);
select is(
  notify_report_resolution('b9100000-0000-4000-8000-000000000001'),
  false,
  'and only once'
);
select is(
  notify_report_resolution('b9100000-0000-4000-8000-000000000002'),
  false,
  'a report filed without an account has nobody to tell'
);

select test_reset();

select is(
  (select count(*)::int from notifications
   where user_id = 'b9000000-0000-4000-8000-000000000001'
     and notification_type = 'report_resolved'),
  2,
  'the notice is queued in the app and, subject to the traveler''s own consent, by email'
);
select is(
  (select distinct payload ->> 'outcome' from notifications
   where user_id = 'b9000000-0000-4000-8000-000000000001'),
  'updated',
  'and says what came of it'
);

select ok(
  exists (select 1 from audit_log where entity_table = 'user_reports'),
  'the resolution is in the audit trail'
);
select ok(
  not exists (select 1 from audit_log
              where entity_table = 'user_reports'
                and (before ? 'user_id' or after ? 'user_id')),
  'but the trail never records who filed the report'
);

-- ── Nobody else can close the loop ────────────────────────────────────────────────────
select test_become('b9000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select notify_report_resolution('b9100000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'a traveler cannot trigger notices to other people'
);
select test_reset();

select is(
  has_function_privilege('anon', 'public.notify_report_resolution(uuid)', 'execute'),
  false,
  'nor can a visitor'
);

select * from finish();
rollback;
