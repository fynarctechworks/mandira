-- pgTAP: phrase packs (PRD-LANG-004, PRD-OPS-CNT-004, A17) — RLS, the publish gate, the view.
--
-- Driven as the roles that actually act: an editor drafts, an approver publishes, a traveler
-- and a guest read. Every other pgTAP file that touches phrases runs as `postgres`, which
-- proves nothing about who may write one.

begin;
select plan(22);

-- ── Identities ────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('f3600000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0036.test'),
  ('f3600000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approver@0036.test'),
  ('f3600000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reviewer@0036.test'),
  ('f3600000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0036.test');

insert into user_roles (user_id, role) values
  ('f3600000-0000-4000-8000-0000000000a1', 'editor'),
  ('f3600000-0000-4000-8000-0000000000a2', 'approver'),
  ('f3600000-0000-4000-8000-0000000000a3', 'reviewer');

create function t36_as(p_user uuid) returns void language plpgsql as $fn$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$fn$;

create function t36_as_anon() returns void language plpgsql as $fn$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$fn$;

create function t36_as_postgres() returns void language plpgsql as $fn$
begin
  execute 'reset role';
  execute 'set local request.jwt.claims = ''''';
end;
$fn$;

-- ── Fixtures (as postgres) ────────────────────────────────────────────────────
insert into destinations (id, slug, name_i18n, status, published_at)
values ('f3610000-0000-4000-8000-000000000001', 'phrase-town', '{"en":"Phrase Town"}'::jsonb,
        'published', now());

insert into media_assets (id, storage_path, media_type, licence) values
  ('f3620000-0000-4000-8000-000000000001', 'audio/0036-licensed.mp3', 'audio', 'CC BY 4.0'),
  ('f3620000-0000-4000-8000-000000000002', 'audio/0036-unlicensed.mp3', 'audio', null),
  ('f3620000-0000-4000-8000-000000000003', 'images/0036-picture.jpg', 'image', 'CC BY 4.0');

-- Published directly by a server identity, which the guard allows (seeds and jobs).
insert into phrases (id, destination_id, context_tag, source_locale, source_text, translations,
                     audio_media_id, sort_order, status, published_at) values
  ('f3630000-0000-4000-8000-000000000002', 'f3610000-0000-4000-8000-000000000001', 'queue', 'en',
   'Is this the queue?', '{"te":{"text":"ఇదేనా వరుస?"}}'::jsonb,
   'f3620000-0000-4000-8000-000000000002', 0, 'published', now()),
  ('f3630000-0000-4000-8000-000000000003', null, 'medical', 'en',
   'I need a doctor.', '{"hi":{"text":"मुझे डॉक्टर चाहिए।","transliteration":"mujhe doctor chahiye."}}'::jsonb,
   'f3620000-0000-4000-8000-000000000003', 0, 'published', now());

-- ── The view's shape ──────────────────────────────────────────────────────────
select has_column('public', 'v_published_phrases', 'audio_path',
  'v_published_phrases carries the audio path (0035)');

-- ── An editor drafts ──────────────────────────────────────────────────────────
select t36_as('f3600000-0000-4000-8000-0000000000a1');

select lives_ok(
  $$ insert into phrases (id, destination_id, context_tag, source_locale, source_text,
                          translations, audio_media_id)
     values ('f3630000-0000-4000-8000-000000000001', 'f3610000-0000-4000-8000-000000000001',
             'directions', 'en', 'Where is the east gate?',
             '{"te":{"text":"తూర్పు ద్వారం ఎక్కడ ఉంది?","transliteration":"turpu dvaram ekkada undi?"}}'::jsonb,
             'f3620000-0000-4000-8000-000000000001') $$,
  'an editor can draft a phrase');

select is(
  (select status::text from phrases where id = 'f3630000-0000-4000-8000-000000000001'), 'draft',
  'a new phrase starts as a draft');

select throws_ok(
  $$ insert into phrases (destination_id, context_tag, source_locale, source_text, status)
     values ('f3610000-0000-4000-8000-000000000001', 'help', 'en', 'Help', 'published') $$,
  '42501', null,
  'an editor cannot create a phrase already published');

select throws_ok(
  $$ update phrases set status = 'published' where id = 'f3630000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'an editor cannot publish by writing the status');

select lives_ok(
  $$ update phrases set status = 'in_review' where id = 'f3630000-0000-4000-8000-000000000001' $$,
  'an editor can submit a phrase for review');

select throws_ok(
  $$ select publish_entity('phrases', 'f3630000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'an editor cannot publish through the gate either');

-- ── A guest cannot see it yet ─────────────────────────────────────────────────
select t36_as_postgres();
select t36_as_anon();

select is_empty(
  $$ select 1 from v_published_phrases where id = 'f3630000-0000-4000-8000-000000000001' $$,
  'a phrase in review is invisible to a guest');

select throws_ok(
  $$ select * from phrases $$,
  '42501', null,
  'a guest has no access to the phrases table itself');

-- ── A traveler reads the view only, and writes nothing ───────────────────────
select t36_as_postgres();
select t36_as('f3600000-0000-4000-8000-0000000000a4');

select is_empty(
  $$ select 1 from phrases $$,
  'a traveler reads no phrase rows from the base table');

select throws_ok(
  $$ insert into phrases (destination_id, context_tag, source_locale, source_text)
     values ('f3610000-0000-4000-8000-000000000001', 'help', 'en', 'Traveler wrote this') $$,
  '42501', null,
  'a traveler cannot write a phrase');

select is_empty(
  $$ update phrases set source_text = 'Changed by a traveler'
      where id = 'f3630000-0000-4000-8000-000000000002' returning 1 $$,
  'a traveler''s update reaches no row');

-- ── A reviewer reads but does not draft (AUTHORIZATION_MODEL) ─────────────────
select t36_as_postgres();
select t36_as('f3600000-0000-4000-8000-0000000000a3');

select isnt_empty(
  $$ select 1 from phrases where id = 'f3630000-0000-4000-8000-000000000001' $$,
  'a reviewer can read drafts');

select throws_ok(
  $$ insert into phrases (destination_id, context_tag, source_locale, source_text)
     values ('f3610000-0000-4000-8000-000000000001', 'help', 'en', 'Reviewer wrote this') $$,
  '42501', null,
  'a reviewer cannot draft a phrase');

-- ── An approver publishes through the gate ───────────────────────────────────
select t36_as_postgres();
select t36_as('f3600000-0000-4000-8000-0000000000a2');

select lives_ok(
  $$ select publish_entity('phrases', 'f3630000-0000-4000-8000-000000000001') $$,
  'an approver who did not make the last change can publish');

select t36_as_postgres();

select is(
  (select status::text from phrases where id = 'f3630000-0000-4000-8000-000000000001'), 'published',
  'and the phrase is published');

select ok(
  exists (select 1 from audit_log
           where entity_table = 'phrases'
             and entity_id = 'f3630000-0000-4000-8000-000000000001'
             and actor_user_id = 'f3600000-0000-4000-8000-0000000000a1'),
  'the editor''s draft is in the audit log');

select ok(
  exists (select 1 from entity_versions
           where entity_table = 'phrases'
             and entity_id = 'f3630000-0000-4000-8000-000000000001'),
  'and in version history');

-- ── What a guest now reads ───────────────────────────────────────────────────
select t36_as_anon();

select is(
  (select audio_path from v_published_phrases where id = 'f3630000-0000-4000-8000-000000000001'),
  'audio/0036-licensed.mp3',
  'a guest reads the published phrase with its licensed audio');

select is(
  (select audio_path from v_published_phrases where id = 'f3630000-0000-4000-8000-000000000002'),
  null,
  'audio without a licence is not offered');

select is(
  (select audio_path from v_published_phrases where id = 'f3630000-0000-4000-8000-000000000003'),
  null,
  'an image linked as audio is not offered');

select isnt_empty(
  $$ select 1 from v_published_phrases
      where id = 'f3630000-0000-4000-8000-000000000003' and destination_id is null $$,
  'a universal phrase (no destination) is published to everyone');

select * from finish();
rollback;
