-- pgTAP: 0045 — advisory and change notifications reach the right travelers, once.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4500000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upcoming@0045.test'),
  ('f4500000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finished@0045.test'),
  ('f4500000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'switched-off@0045.test'),
  ('f4500000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elsewhere@0045.test'),
  ('f4500000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'much-later@0045.test');

update profiles set notification_prefs = '{"advisory": false, "journey_change": false}'::jsonb
 where id = 'f4500000-0000-4000-8000-0000000000a3';

insert into destinations (id, slug, name_i18n, centre, radius_km, status) values
  ('f4510000-0000-4000-8000-000000000001', 'notify-town-0045', '{"en":"Town"}'::jsonb, 'SRID=4326;POINT(80.0 15.0)', 5, 'published'),
  ('f4510000-0000-4000-8000-000000000002', 'other-town-0045', '{"en":"Other"}'::jsonb, 'SRID=4326;POINT(81.0 16.0)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location, address, status) values
  ('f4520000-0000-4000-8000-000000000001', 'f4510000-0000-4000-8000-000000000001', 'notify-shrine-0045',
   '{"en":"Shrine"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'North gate', 'published'),
  ('f4520000-0000-4000-8000-000000000002', 'f4510000-0000-4000-8000-000000000001', 'unrelated-hall-0045',
   '{"en":"Hall"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)', 'South gate', 'published');

insert into journeys (id, owner_user_id, title, status, start_date, end_date, timezone) values
  ('f4530000-0000-4000-8000-000000000001', 'f4500000-0000-4000-8000-0000000000a1', 'Soon', 'upcoming',
   (now() at time zone 'Asia/Kolkata')::date + 3, (now() at time zone 'Asia/Kolkata')::date + 4, 'Asia/Kolkata'),
  ('f4530000-0000-4000-8000-000000000002', 'f4500000-0000-4000-8000-0000000000a2', 'Done', 'completed',
   (now() at time zone 'Asia/Kolkata')::date - 9, (now() at time zone 'Asia/Kolkata')::date - 8, 'Asia/Kolkata'),
  ('f4530000-0000-4000-8000-000000000003', 'f4500000-0000-4000-8000-0000000000a3', 'Quiet', 'upcoming',
   (now() at time zone 'Asia/Kolkata')::date + 3, (now() at time zone 'Asia/Kolkata')::date + 4, 'Asia/Kolkata'),
  ('f4530000-0000-4000-8000-000000000004', 'f4500000-0000-4000-8000-0000000000a4', 'Elsewhere', 'upcoming',
   (now() at time zone 'Asia/Kolkata')::date + 3, (now() at time zone 'Asia/Kolkata')::date + 4, 'Asia/Kolkata'),
  ('f4530000-0000-4000-8000-000000000005', 'f4500000-0000-4000-8000-0000000000a5', 'Later', 'upcoming',
   (now() at time zone 'Asia/Kolkata')::date + 30, (now() at time zone 'Asia/Kolkata')::date + 31, 'Asia/Kolkata');

insert into journey_destinations (journey_id, destination_id, sort_order) values
  ('f4530000-0000-4000-8000-000000000001', 'f4510000-0000-4000-8000-000000000001', 0),
  ('f4530000-0000-4000-8000-000000000002', 'f4510000-0000-4000-8000-000000000001', 0),
  ('f4530000-0000-4000-8000-000000000003', 'f4510000-0000-4000-8000-000000000001', 0),
  ('f4530000-0000-4000-8000-000000000004', 'f4510000-0000-4000-8000-000000000002', 0),
  ('f4530000-0000-4000-8000-000000000005', 'f4510000-0000-4000-8000-000000000001', 0);

insert into journey_items (journey_id, day_index, sort_order, item_type, tier, place_id)
select j, 0, 0, 'experience', 'important', 'f4520000-0000-4000-8000-000000000001'::uuid
  from unnest(array[
    'f4530000-0000-4000-8000-000000000001', 'f4530000-0000-4000-8000-000000000002',
    'f4530000-0000-4000-8000-000000000003']::uuid[]) as j;

create or replace function t45_count(p_user uuid, p_type text) returns int language sql as $$
  select count(*)::int from notifications where user_id = p_user and notification_type::text = p_type;
$$;

-- ── Advisories ──────────────────────────────────────────────────────────────────────────

-- Written as a draft, then published: the publish is what tells people.
insert into advisories (id, destination_id, title_i18n, body_i18n, severity, status, starts_at, ends_at)
values ('f4540000-0000-4000-8000-000000000001', 'f4510000-0000-4000-8000-000000000001',
        '{"en":"Road works"}'::jsonb, '{"en":"The ghat road is single-lane."}'::jsonb,
        'caution', 'draft', now(), now() + interval '6 days');
select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'advisory'), 0, 'a draft advisory tells nobody');

update advisories set status = 'published', published_at = now()
 where id = 'f4540000-0000-4000-8000-000000000001';

select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'advisory'), 3,
  'a traveler with an upcoming journey there is told, in the app, by push and by email');
select is(
  (select journey_id from notifications
    where user_id = 'f4500000-0000-4000-8000-0000000000a1' and notification_type = 'advisory' limit 1),
  'f4530000-0000-4000-8000-000000000001'::uuid, 'and the notice opens that journey');
select is(t45_count('f4500000-0000-4000-8000-0000000000a2', 'advisory')
        + t45_count('f4500000-0000-4000-8000-0000000000a3', 'advisory')
        + t45_count('f4500000-0000-4000-8000-0000000000a4', 'advisory'), 0,
  'nobody whose journey is over, who switched advisories off, or who is going somewhere else');
select is(t45_count('f4500000-0000-4000-8000-0000000000a5', 'advisory'), 0,
  'nor someone whose journey starts after the advisory ends');

update advisories set status = 'draft' where id = 'f4540000-0000-4000-8000-000000000001';
update advisories set status = 'published' where id = 'f4540000-0000-4000-8000-000000000001';
select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'advisory'), 3,
  'republishing the same advisory does not tell them again');

insert into advisories (id, destination_id, title_i18n, body_i18n, severity, status)
values ('f4540000-0000-4000-8000-000000000002', 'f4510000-0000-4000-8000-000000000001',
        '{"en":"Festival crowds"}'::jsonb, '{"en":"Expect long queues."}'::jsonb, 'info', 'published');
select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'advisory'), 3,
  'a second advisory in the same week waits: one non-journey notification a week (PRD F15)');

-- ── Corrections to something a journey uses ─────────────────────────────────────────────

insert into knowledge_updates (entity_table, entity_id, destination_id, changed_fields)
values ('places', 'f4520000-0000-4000-8000-000000000001', 'f4510000-0000-4000-8000-000000000001', '["opening_schedule"]'::jsonb);

select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'journey_change'), 3,
  'a correction to a place in an upcoming journey tells its traveler');
select is(t45_count('f4500000-0000-4000-8000-0000000000a2', 'journey_change')
        + t45_count('f4500000-0000-4000-8000-0000000000a3', 'journey_change'), 0,
  'but not about a journey that is over, nor to someone who switched it off');

insert into knowledge_updates (entity_table, entity_id, destination_id, changed_fields)
values ('places', 'f4520000-0000-4000-8000-000000000001', 'f4510000-0000-4000-8000-000000000001', '["closure_rules_i18n"]'::jsonb);
select is(t45_count('f4500000-0000-4000-8000-0000000000a1', 'journey_change'), 3,
  'several corrections close together are one piece of news');

insert into knowledge_updates (entity_table, entity_id, destination_id, changed_fields)
values ('places', 'f4520000-0000-4000-8000-000000000002', 'f4510000-0000-4000-8000-000000000001', '["address"]'::jsonb);
select is((select count(*)::int from notifications where notification_type = 'journey_change'
             and user_id::text like 'f4500000-%'), 3,
  'a correction to something no journey uses tells nobody');

-- ── Nobody calls these directly ─────────────────────────────────────────────────────────

set local role authenticated;
select throws_ok(
  $$ select queue_advisory_notifications('f4540000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a signed-in user cannot queue notifications for others');
reset role;

select * from finish();
rollback;
