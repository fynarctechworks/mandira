-- pgTAP: 0049 — translators write one non-English value of an allowlisted field, with its
-- status, and nothing else; progress counts only confirmed values whose English still matches.
begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4900000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'translator@0049.test'),
  ('f4900000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'researcher@0049.test'),
  ('f4900000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0049.test');

insert into user_roles (user_id, role) values
  ('f4900000-0000-4000-8000-0000000000a1', 'translator'),
  ('f4900000-0000-4000-8000-0000000000a2', 'researcher');

insert into destinations (id, slug, name_i18n)
values ('f4910000-0000-4000-8000-000000000001', 't49-dest', '{"en":"T49 Destination"}');

insert into places (id, destination_id, slug, name_i18n, place_type, entry_requirements_i18n)
values ('f4910000-0000-4000-8000-000000000002', 'f4910000-0000-4000-8000-000000000001',
        't49-temple', '{"en":"T49 Temple"}', 'temple', '{"en":"Remove your shoes"}');

create or replace function t49_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- ── Saving ───────────────────────────────────────────────────────────────────

select t49_as('f4900000-0000-4000-8000-0000000000a1');

select is(
  save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'te', 'T49 గుడి', 'draft'),
  'draft', 'a translator saves a Telugu draft');
select is(
  save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'entry_requirements_i18n', 'te', 'చెప్పులు తీసివేయండి', 'confirmed'),
  'confirmed', 'and confirms another field');

select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'en', 'Renamed', 'confirmed') $$,
  '23514', null, 'English cannot be written through the translation path');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'slug', 'te', 'x', 'draft') $$,
  '23514', null, 'nor a field outside the allowlist');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'status', 'te', 'published', 'draft') $$,
  '23514', null, 'nor the publish status');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'zz', 'x', 'draft') $$,
  '23514', null, 'nor a language that is not active');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'summary_i18n', 'te', 'x', 'draft') $$,
  '23514', null, 'nor a field with no English to translate from');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'te', 'x', 'published') $$,
  '23514', null, 'and a status is a draft or confirmed, never anything else');

reset role;

select is(
  (select name_i18n from places where id = 'f4910000-0000-4000-8000-000000000002'),
  '{"en":"T49 Temple","te":"T49 గుడి"}'::jsonb,
  'the Telugu value lands in the column beside the untouched English');
select is(
  (select status || ':' || source_text from content_translations
    where entity_id = 'f4910000-0000-4000-8000-000000000002' and field_name = 'entry_requirements_i18n' and locale = 'te'),
  'confirmed:Remove your shoes', 'with its status and the English it was made from');
select is(
  (select status::text from places where id = 'f4910000-0000-4000-8000-000000000002'),
  'draft', 'and the publish status is untouched');

-- ── Who may ──────────────────────────────────────────────────────────────────

select t49_as('f4900000-0000-4000-8000-0000000000a2');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'hi', 'x', 'draft') $$,
  '42501', null, 'a researcher without the translator role cannot translate');
reset role;

select t49_as('f4900000-0000-4000-8000-0000000000a3');
select throws_ok(
  $$ select save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'hi', 'x', 'draft') $$,
  '42501', null, 'nor a traveler');
select is((select count(*)::int from content_translations), 0, 'who reads no translation status');
select throws_ok($$ select content_translation_overview('te') $$, '42501', null,
  'and no translation progress');
reset role;

-- ── Progress ─────────────────────────────────────────────────────────────────

select t49_as('f4900000-0000-4000-8000-0000000000a1');
select is(
  content_translation_overview('te', 50, 'f4910000-0000-4000-8000-000000000002')
    - 'next' - 'locale',
  '{"fields":2,"confirmed":1,"drafts":1,"english_changed":0,"missing":0}'::jsonb,
  'one entity: two fields with English, one confirmed, one draft');
reset role;

update places set entry_requirements_i18n = entry_requirements_i18n || '{"en":"Remove shoes and socks"}'
 where id = 'f4910000-0000-4000-8000-000000000002';

select t49_as('f4900000-0000-4000-8000-0000000000a1');
select is(
  (content_translation_overview('te', 50, 'f4910000-0000-4000-8000-000000000002') #> '{next,0}')
    - 'entity_id'::text - 'entity_table'::text,
  '{"label":"T49 Temple","fields":2,"confirmed":0,"english_changed":1}'::jsonb,
  'when the English changes, the confirmed translation no longer counts, and says why');

select is(
  save_content_translation('places', 'f4910000-0000-4000-8000-000000000002', 'name_i18n', 'te', '  ', 'draft'),
  null, 'saving nothing clears a translation');
reset role;

select ok(
  not (select name_i18n ? 'te' from places where id = 'f4910000-0000-4000-8000-000000000002'),
  'the Telugu key is gone from the column');
select is(
  (select count(*)::int from content_translations
    where entity_id = 'f4910000-0000-4000-8000-000000000002' and field_name = 'name_i18n'),
  0, 'and its status with it');

select * from finish();
rollback;
