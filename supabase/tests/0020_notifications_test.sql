-- pgTAP: notifications reach one traveler and nobody else (B-027, PRD F15, PRD-PRIV-002).
--
-- Two things worth pinning. A push subscription identifies a BROWSER, and the notification
-- queue records what somebody is about to be told about their own day — where they are
-- going and when they need to leave. Both are the traveler's, and the sender is the only
-- job in the product that legitimately reads across users, so the boundary matters.

begin;
select plan(12);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'walker@notif.test'),
  ('f1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stranger@notif.test');

-- ── The type vocabulary matches PRD F15's table, exactly ────────────────────
select is(
  (select count(*)::int from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type_enum'),
  7,
  'notification_type_enum carries exactly PRD F15''s seven types'
);

select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = 'notification_type_enum' and e.enumlabel = 'leave_by'),
  'including leave_by, the one that has to work offline'
);

-- ── A traveler may READ and mark read, never create ─────────────────────────
--
-- Scheduling is the product's decision, not the traveler's: `authenticated` holds SELECT
-- and UPDATE and no INSERT. That is why the scheduler reads the journey as the traveler —
-- so RLS stops anyone scheduling for a journey they do not own — and writes as
-- service-role. Getting it the other way round fails silently, which is exactly what this
-- assertion caught during B-027.
select test_become('f1000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ insert into notifications (user_id, notification_type, channel)
     values ('f1000000-0000-4000-8000-000000000001', 'suggestion', 'push') $$,
  '42501',
  null,
  'a traveler cannot schedule a notification for themselves'
);

reset role;

insert into notifications (id, user_id, notification_type, channel, status, scheduled_for)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'leave_by', 'push', 'scheduled', now() + interval '1 hour');

select test_become('f1000000-0000-4000-8000-000000000001');

select isnt_empty(
  $$ select 1 from notifications $$,
  'a traveler sees their own reminders'
);

select is(
  (select status from notifications where id = 'f2000000-0000-4000-8000-000000000001'),
  'scheduled',
  'a queued reminder starts scheduled, not sent'
);

select is(
  (select sent_at from notifications where id = 'f2000000-0000-4000-8000-000000000001'),
  null,
  'and carries no sent time until something actually sends it'
);

insert into notification_subscriptions (id, user_id, endpoint, keys)
values ('f3000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'https://push.example.invalid/walker', '{"p256dh":"k","auth":"a"}'::jsonb);

select isnt_empty(
  $$ select 1 from notification_subscriptions $$,
  'and their own push subscription'
);

-- One browser, one row. A traveler who reinstalls twice must not get three copies of every
-- reminder — the unique endpoint is what makes the upsert an update.
select throws_ok(
  $$ insert into notification_subscriptions (user_id, endpoint, keys)
     values ('f1000000-0000-4000-8000-000000000001',
             'https://push.example.invalid/walker', '{"p256dh":"k","auth":"a"}'::jsonb) $$,
  '23505',
  null,
  'the same browser cannot be subscribed twice'
);

-- ── The stranger ────────────────────────────────────────────────────────────
select test_become('f1000000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from notifications $$,
  'a stranger cannot read what someone else is about to be told'
);

select is_empty(
  $$ select 1 from notification_subscriptions $$,
  'nor which browsers they use'
);

-- An UPDATE filtered away by RLS reports success and changes nothing, so assert on the ROW.
update notifications set status = 'cancelled'
 where id = 'f2000000-0000-4000-8000-000000000001';

select test_become('f1000000-0000-4000-8000-000000000001');

select is(
  (select status from notifications where id = 'f2000000-0000-4000-8000-000000000001'),
  'scheduled',
  'and cannot cancel a reminder that is not theirs'
);

-- The status vocabulary is a CHECK, not an enum, so a route typo would otherwise write a
-- status the sender does not recognise and the row would sit in the queue forever.
select throws_ok(
  $$ update notifications set status = 'delivered'
      where id = 'f2000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'and no route can invent a status the sender does not know'
);

select * from finish();
rollback;
