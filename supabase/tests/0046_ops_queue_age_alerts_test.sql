-- pgTAP: 0046 — which queues are overdue, who hears about it, and the job that tells them.
begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4600000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@0046.test'),
  ('f4600000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0046.test');

insert into user_roles (user_id, role) values
  ('f4600000-0000-4000-8000-0000000000a1', 'admin'),
  ('f4600000-0000-4000-8000-0000000000a2', 'editor');

-- A verification task nobody has touched for longer than anything else the database holds.
insert into review_tasks (task_type, entity_table, entity_id, status, created_at)
values ('verify', 'places', gen_random_uuid(), 'open', now() - interval '4000 days');

select ok(
  exists (select 1 from ops_overdue_queues(3999) where queue = 'verify' and open_count >= 1),
  'a queue whose oldest item waited past the limit is overdue');
select is_empty(
  $$ select 1 from ops_overdue_queues(40000) $$,
  'and nothing is overdue against a limit nothing has waited that long for');

select ok(
  exists (select 1 from ops_alert_recipients() where email = 'admin@0046.test'),
  'admins are told');
select ok(
  not exists (select 1 from ops_alert_recipients() where email = 'editor@0046.test'),
  'other Ops roles are not emailed about every queue');

select ok(
  exists (select 1 from v_job_health where job_name = 'send_ops_alerts'),
  'the daily alert job is watched like every other job');

select lives_ok(
  $$ select dispatch_app_cron('send_ops_alerts') $$,
  'the dispatcher knows the alert job');

set local role authenticated;
select throws_ok(
  $$ select * from ops_alert_recipients() $$,
  '42501', null, 'no signed-in user can list the admins');
reset role;

select * from finish();
rollback;
