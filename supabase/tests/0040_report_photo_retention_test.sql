-- 0040 · report photos leave once their report is done with them (D-177)
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
  ('c9000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'photographer@retention.test');

-- Four photos in the private bucket, one per case.
insert into media_assets (id, storage_path, storage_bucket, media_type) values
  ('c9200000-0000-4000-8000-000000000001', '2026/01/resolved-long-ago.jpg', 'reports', 'image'),
  ('c9200000-0000-4000-8000-000000000002', '2026/09/resolved-yesterday.jpg', 'reports', 'image'),
  ('c9200000-0000-4000-8000-000000000003', '2026/01/never-resolved-old.jpg', 'reports', 'image'),
  ('c9200000-0000-4000-8000-000000000004', '2026/09/open-and-recent.jpg', 'reports', 'image');

insert into user_reports
  (id, user_id, report_type, entity_table, entity_id, status, resolved_at, created_at, media_id)
values
  ('c9100000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'closed',
   'places', 'd0000000-0000-4000-8000-00000000f002', 'resolved_updated',
   now() - interval '40 days', now() - interval '60 days', 'c9200000-0000-4000-8000-000000000001'),
  ('c9100000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'closed',
   'places', 'd0000000-0000-4000-8000-00000000f002', 'resolved_confirmed_correct',
   now() - interval '1 day', now() - interval '10 days', 'c9200000-0000-4000-8000-000000000002'),
  ('c9100000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'closed',
   'places', 'd0000000-0000-4000-8000-00000000f002', 'new',
   null, now() - interval '200 days', 'c9200000-0000-4000-8000-000000000003'),
  ('c9100000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000001', 'closed',
   'places', 'd0000000-0000-4000-8000-00000000f002', 'triaged',
   null, now() - interval '5 days', 'c9200000-0000-4000-8000-000000000004');

select set_eq(
  $$ select media_id from report_photos_due(100)
     where media_id::text like 'c92%' $$,
  $$ values ('c9200000-0000-4000-8000-000000000001'::uuid),
            ('c9200000-0000-4000-8000-000000000003'::uuid) $$,
  'due: resolved more than 30 days ago, and unresolved after 180 days — nothing else'
);

select is(
  (select storage_path from report_photos_due(100)
   where media_id = 'c9200000-0000-4000-8000-000000000001'),
  '2026/01/resolved-long-ago.jpg',
  'with the path the route removes from storage'
);

select is(forget_report_photo('c9200000-0000-4000-8000-000000000001'), true,
  'forgetting a removed photo deletes its row');
select is(
  (select media_id from user_reports where id = 'c9100000-0000-4000-8000-000000000001'),
  null,
  'and detaches it from the report, which stays'
);
select is(forget_report_photo('c9200000-0000-4000-8000-000000000001'), false,
  'forgetting twice is harmless');
select is(
  forget_report_photo((select id from media_assets where storage_bucket = 'media' limit 1)),
  false,
  'a library image is never touched'
);

select is(
  has_function_privilege('authenticated', 'public.report_photos_due(integer)', 'execute')
    or has_function_privilege('anon', 'public.report_photos_due(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.forget_report_photo(uuid)', 'execute')
    or has_function_privilege('anon', 'public.forget_report_photo(uuid)', 'execute'),
  false,
  'no client role can list or delete report photos'
);

delete from vault.secrets where name in ('mandhira_web_url', 'mandhira_cron_secret');
select is(
  (dispatch_app_cron('purge_report_photos') ->> 'configured')::boolean,
  false,
  'the daily job goes through the same dispatcher'
);
select ok(
  exists (select 1 from v_job_health where job_name = 'purge_report_photos'),
  'and is watched on the Ops job panel'
);
select ok(
  exists (select 1 from cron.job where jobname = 'purge_report_photos' and schedule = '40 21 * * *'),
  'every night'
);

select test_become('c9000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from jsonb_array_elements(export_my_data() -> 'reports') e
   where (e ->> 'has_photo')::boolean),
  3,
  'a traveler''s export says which reports still carry a photo'
);
select is(
  (select count(*)::int from jsonb_array_elements(export_my_data() -> 'reports')),
  4,
  'and still lists every report'
);

select * from finish();
rollback;
