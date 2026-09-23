-- pgTAP: 0055 — a resolved report tells its reporter which of the three outcomes it was.
begin;
select plan(7);

create function t55_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;
grant execute on function t55_as(uuid) to authenticated;

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5500000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reporter@0055.test'),
  ('f5500000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'support@0055.test');
insert into user_roles (user_id, role) values ('f5500000-0000-4000-8000-0000000000a2', 'support');

-- Three reports from one traveler, one per outcome.
insert into user_reports (id, user_id, report_type, entity_table, entity_id, status, resolved_at) values
  ('f5510000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-0000000000a1',
   'timing_changed', 'places', 'd0000000-0000-4000-8000-00000000f002', 'resolved_updated', now()),
  ('f5510000-0000-4000-8000-000000000002', 'f5500000-0000-4000-8000-0000000000a1',
   'timing_changed', 'places', 'd0000000-0000-4000-8000-00000000f002', 'resolved_confirmed_correct', now()),
  ('f5510000-0000-4000-8000-000000000003', 'f5500000-0000-4000-8000-0000000000a1',
   'timing_changed', 'places', 'd0000000-0000-4000-8000-00000000f002', 'resolved_unverifiable', now());

select t55_as('f5500000-0000-4000-8000-0000000000a2');
select ok(notify_report_resolution('f5510000-0000-4000-8000-000000000001'), 'updated: notified');
select ok(notify_report_resolution('f5510000-0000-4000-8000-000000000002'), 'confirmed: notified');
select ok(notify_report_resolution('f5510000-0000-4000-8000-000000000003'), 'unverifiable: notified');
reset role;

create function t55_body(p_outcome text) returns text language sql as $$
  select body_i18n ->> 'key' from notifications
   where user_id = 'f5500000-0000-4000-8000-0000000000a1'
     and notification_type = 'report_resolved'
     and channel = 'inapp'
     and payload ->> 'outcome' = p_outcome
$$;

select is(t55_body('updated'), 'notify.report_resolved.body_updated',
  'a report that changed something says it was updated');
select is(t55_body('confirmed'), 'notify.report_resolved.body_confirmed',
  'one that was right all along says so');
select is(t55_body('unverified'), 'notify.report_resolved.body_unverified',
  'and one nobody could check says THAT — which is information too');

select is(
  (select count(distinct body_i18n ->> 'key')::int from notifications
    where user_id = 'f5500000-0000-4000-8000-0000000000a1'
      and notification_type = 'report_resolved'),
  3, 'three outcomes, three different sentences — never one "looked at" for all');

select * from finish();
rollback;
