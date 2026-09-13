-- pgTAP: 0036 — media focal points (PRD-OPS-CNT-003) and private report photos (PRD F14, D-016).
--
-- Two promises are pinned here. A focal point is ordinary media metadata: readable where the
-- image is, and versioned and audited like every other Ops edit (0029). A report photo is not
-- media at all as far as any client is concerned: no client role — Ops included — can see its
-- row, attach it to content, list the bucket, or read or write an object in it. The server
-- signs a short-lived URL for the operators who may read the report, and nothing else does.

begin;
select plan(26);

create function test_become(p_user uuid) returns void
language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function test_become_server() returns void
language plpgsql as $fn$
begin
  execute 'set local role service_role';
  execute 'set local request.jwt.claims = ''{"role":"service_role"}''';
end;
$fn$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('a3700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'media@photos.test'),
  ('a3700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'support@photos.test'),
  ('a3700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pilgrim@photos.test');

insert into user_roles (user_id, role) values
  ('a3700000-0000-4000-8000-000000000001', 'media'),
  ('a3700000-0000-4000-8000-000000000002', 'support');

insert into media_assets (id, storage_path, media_type, licence) values
  ('a3710000-0000-4000-8000-000000000001', 'library/gopuram.jpg', 'image', 'CC BY 4.0');
insert into media_assets (id, storage_path, media_type, storage_bucket) values
  ('a3710000-0000-4000-8000-000000000002', '2026/09/7c1f.jpg', 'image', 'reports');

insert into user_reports (id, user_id, report_type, entity_table, entity_id) values
  ('a3720000-0000-4000-8000-000000000001', 'a3700000-0000-4000-8000-000000000003',
   'closed', 'places', 'd0000000-0000-4000-8000-00000000f002');

-- ── Columns ─────────────────────────────────────────────────────────────────
select col_type_is('public', 'media_assets', 'focal_x', 'numeric(4,3)', 'media_assets.focal_x exists');
select col_type_is('public', 'media_assets', 'focal_y', 'numeric(4,3)', 'media_assets.focal_y exists');
select col_default_is('public', 'media_assets', 'storage_bucket', 'media'::text,
  'a new asset belongs to the public media library unless the server says otherwise');

select results_eq(
  $$ select focal_x, focal_y from media_assets where id = 'a3710000-0000-4000-8000-000000000001' $$,
  $$ values (0.5::numeric(4,3), 0.5::numeric(4,3)) $$,
  'an asset with no focal point set is framed from its centre');

select throws_ok(
  $$ update media_assets set focal_x = 1.2 where id = 'a3710000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a focal point outside the image is refused');

-- ── Grants ──────────────────────────────────────────────────────────────────
select ok(
  has_column_privilege('anon', 'public.media_assets', 'focal_x', 'select')
    and has_column_privilege('anon', 'public.media_assets', 'focal_y', 'select'),
  'a traveler can read the focal point of an image they can already see');

select ok(
  not has_column_privilege('anon', 'public.media_assets', 'storage_bucket', 'select')
    and not has_column_privilege('authenticated', 'public.media_assets', 'storage_bucket', 'select'),
  'which bucket an asset lives in is not granted to any client role');

select ok(
  not has_table_privilege('anon', 'public.media_assets', 'select'),
  'anon still holds media_assets by column only (0031 baseline unchanged)');

select ok(
  not has_function_privilege('authenticated', 'public.guard_user_report_photo()', 'execute')
    and not has_function_privilege('anon', 'public.guard_entity_media_library_asset()', 'execute'),
  'the guard trigger functions are not callable by client roles');

-- ── Version history and audit still fire on a focal-point edit ───────────────
select test_become('a3700000-0000-4000-8000-000000000001');

update media_assets set focal_x = 0.25, focal_y = 0.8
 where id = 'a3710000-0000-4000-8000-000000000001';

reset role;

select is(
  (select changed_fields from entity_versions
    where entity_table = 'media_assets' and entity_id = 'a3710000-0000-4000-8000-000000000001'
    order by version desc limit 1),
  array['focal_x', 'focal_y'],
  'a focal-point edit is recorded in entity_versions with exactly the fields that changed');

select is(
  (select (after ->> 'focal_x')::numeric from audit_log
    where entity_table = 'media_assets' and entity_id = 'a3710000-0000-4000-8000-000000000001'
      and action = 'update' and actor_user_id = 'a3700000-0000-4000-8000-000000000001'
    order by created_at desc limit 1),
  0.25::numeric,
  'and audited against the operator who made it');

-- ── No client role sees or writes a report photo's row ───────────────────────
select test_become('a3700000-0000-4000-8000-000000000001');

select results_eq(
  $$ select id from media_assets order by id $$,
  $$ values ('a3710000-0000-4000-8000-000000000001'::uuid) $$,
  'the media library shows library assets and no traveler photo');

select throws_ok(
  $$ insert into media_assets (storage_path, media_type, licence, storage_bucket)
     values ('2026/09/forged.jpg', 'image', 'mine', 'reports') $$,
  '42501', null, 'an operator cannot create an asset in the reports bucket');

select throws_ok(
  $$ update media_assets set storage_bucket = 'reports'
      where id = 'a3710000-0000-4000-8000-000000000001' $$,
  '42501', null, 'nor move a library asset into it');

select test_become('a3700000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from media_assets where id = 'a3710000-0000-4000-8000-000000000002' $$,
  'even Support, who may view report photos, does not read the row — only a signed URL');

select test_become('a3700000-0000-4000-8000-000000000003');

select is_empty(
  $$ select 1 from media_assets where id = 'a3710000-0000-4000-8000-000000000002' $$,
  'nor does the traveler who took it');

-- ── A report photo cannot be attached by a client, or to content ─────────────
select throws_ok(
  $$ insert into user_reports (user_id, report_type, entity_table, entity_id, media_id)
     values ('a3700000-0000-4000-8000-000000000003', 'closed', 'places',
             'd0000000-0000-4000-8000-00000000f002', 'a3710000-0000-4000-8000-000000000002') $$,
  '42501', null, 'a traveler cannot set the photo on a report themselves');

reset role;

select throws_ok(
  $$ insert into entity_media (media_id, entity_table, entity_id, role)
     values ('a3710000-0000-4000-8000-000000000002', 'places',
             'd0000000-0000-4000-8000-00000000f002', 'hero') $$,
  '42501', null, 'a report photo cannot become an image on a place, whoever tries');

select test_become_server();

select lives_ok(
  $$ update user_reports set media_id = 'a3710000-0000-4000-8000-000000000002'
      where id = 'a3720000-0000-4000-8000-000000000001' $$,
  'the server attaches a reports-bucket photo to a report');

select throws_ok(
  $$ update user_reports set media_id = 'a3710000-0000-4000-8000-000000000001'
      where id = 'a3720000-0000-4000-8000-000000000001' $$,
  '23514', null, 'but not a library asset, so the queue never signs a URL for public media');

reset role;

-- ── The bucket: private, JPEG only, and no client policy at all ──────────────
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'reports' $$,
  $$ values (false, 2097152::bigint, array['image/jpeg']::text[]) $$,
  'the reports bucket is private and takes only what the route produces');

select is_empty(
  $$ select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (coalesce(qual, '') ilike '%reports%' or coalesce(with_check, '') ilike '%reports%') $$,
  'no storage policy mentions the reports bucket, so no client role reaches it');

insert into storage.objects (bucket_id, name) values ('reports', '2026/09/7c1f.jpg');

select test_become('a3700000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('reports', 'a3700000-0000-4000-8000-000000000003/mine.jpg') $$,
  '42501', null, 'a traveler cannot write into the reports bucket directly, even under their own id');

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'reports' $$,
  'nor list or read it');

select test_become('a3700000-0000-4000-8000-000000000002');

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'reports' $$,
  'Support cannot list the bucket either — photos are reached one signed URL at a time');

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'reports' $$,
  'and a guest sees nothing');

reset role;

select * from finish();
rollback;
