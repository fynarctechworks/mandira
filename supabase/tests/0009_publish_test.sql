-- pgTAP: pre-publish validation and the publish action (PRD F18, PRD-OPS-WF-004/009).
--
-- These are the rules that decide whether unverified information can reach a traveler, so
-- the denials matter more than the allows.

begin;
select plan(15);

select has_function('public', 'validate_for_publish', 'validate_for_publish() exists');
select has_function('public', 'publish_entity', 'publish_entity() exists');

-- ── Fixtures ──────────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email)
values
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'editor@publish.test'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'approver@publish.test');

insert into user_roles (user_id, role) values
  ('c1000000-0000-4000-8000-000000000001', 'editor'),
  ('c1000000-0000-4000-8000-000000000002', 'approver');

insert into sources (id, name, source_type, tier)
values ('c2000000-0000-4000-8000-000000000001', 'Temple authority', 'official_authority', 'T1');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('c3000000-0000-4000-8000-000000000001', 'publish-test', '{"en":"Publish Test"}'::jsonb,
        'SRID=4326;POINT(83.0107 25.3109)', 5, 'draft');

insert into places (id, destination_id, slug, name_i18n, place_type, location)
values ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
        'main-temple', '{"en":"Main Temple"}'::jsonb, 'temple',
        'SRID=4326;POINT(83.0110 25.3112)');

-- ── Validation ────────────────────────────────────────────────────────────────

-- A brand-new place is blocked, and every blocking field is named.
select is(
  (select jsonb_array_length(validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001'))),
  3,
  'a place with no trust records reports all three critical fields'
);

select isnt_empty(
  $$ select 1 from jsonb_array_elements(
       validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001')
     ) p where p ->> 'field' = 'opening_schedule' $$,
  'the blocking fields are named, not just counted'
);

-- Review all three; the place becomes publishable.
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
select 'places', 'c4000000-0000-4000-8000-000000000001', f,
       'c2000000-0000-4000-8000-000000000001', 'T1', 'human_reviewed'
from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

select is(
  (select validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001')),
  '[]'::jsonb,
  'a fully reviewed place has nothing blocking it'
);

-- A pin outside the destination radius is almost always a transposed coordinate.
update places set location = 'SRID=4326;POINT(72.8777 19.0760)'
 where id = 'c4000000-0000-4000-8000-000000000001';

select isnt_empty(
  $$ select 1 from jsonb_array_elements(
       validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001')
     ) p where p ->> 'field' = 'location' $$,
  'a pin outside the destination radius blocks publication'
);

update places set location = 'SRID=4326;POINT(83.0110 25.3112)'
 where id = 'c4000000-0000-4000-8000-000000000001';

-- Unlicensed media blocks publication (PRD F18).
insert into media_assets (id, storage_path, media_type, licence)
values ('c5000000-0000-4000-8000-000000000001', 'media/x.jpg', 'image', null);
insert into entity_media (media_id, entity_table, entity_id, role)
values ('c5000000-0000-4000-8000-000000000001', 'places',
        'c4000000-0000-4000-8000-000000000001', 'hero');

select isnt_empty(
  $$ select 1 from jsonb_array_elements(
       validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001')
     ) p where p ->> 'field' = 'media' $$,
  'media without a licence blocks publication'
);

update media_assets set licence = 'CC BY 4.0' where id = 'c5000000-0000-4000-8000-000000000001';

-- An open conflict blocks publication.
insert into conflicts (entity_table, entity_id, field_name, status)
values ('places', 'c4000000-0000-4000-8000-000000000001', 'opening_schedule', 'open');

select isnt_empty(
  $$ select 1 from jsonb_array_elements(
       validate_for_publish('places', 'c4000000-0000-4000-8000-000000000001')
     ) p where p ->> 'field' = 'conflict' $$,
  'an open conflict blocks publication'
);

update conflicts set status = 'resolved_winner'
 where entity_table = 'places' and entity_id = 'c4000000-0000-4000-8000-000000000001';

-- An experience with no availability cannot be scheduled, so it cannot be published.
insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type)
values ('c6000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001',
        'c4000000-0000-4000-8000-000000000001', 'darshan', '{"en":"Darshan"}'::jsonb, 'darshan');

select isnt_empty(
  $$ select 1 from jsonb_array_elements(
       validate_for_publish('experiences', 'c6000000-0000-4000-8000-000000000001')
     ) p where p ->> 'field' = 'availability' $$,
  'an experience with no availability rules is blocked'
);

-- ── Publishing ────────────────────────────────────────────────────────────────

create or replace function become(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

-- The editor's change makes them the last changed_by.
select become('c1000000-0000-4000-8000-000000000001'::uuid);
update places set address = 'Edited by the editor'
 where id = 'c4000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select publish_entity('places', 'c4000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'an editor without the approver role cannot publish'
);

-- The approver may publish — but not something they themselves last changed.
select become('c1000000-0000-4000-8000-000000000002'::uuid);

select lives_ok(
  $$ select publish_entity('places', 'c4000000-0000-4000-8000-000000000001') $$,
  'an approver publishes a valid, reviewed place'
);

select is(
  (select status::text from places where id = 'c4000000-0000-4000-8000-000000000001'),
  'published',
  'the place is now published'
);

select isnt_empty(
  $$ select 1 from audit_log
      where action = 'publish' and entity_id = 'c4000000-0000-4000-8000-000000000001' $$,
  'publishing writes an audit entry'
);

-- Self-approval is refused: the approver edits, then tries to publish their own change.
update places set address = 'Edited by the approver'
 where id = 'c4000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ select publish_entity('places', 'c4000000-0000-4000-8000-000000000001') $$,
  '23514',
  null,
  'the person who last changed an entity cannot approve it (PRD-OPS-WF-009)'
);

-- An invalid entity is refused even for an approver.
select throws_ok(
  $$ select publish_entity('experiences', 'c6000000-0000-4000-8000-000000000001') $$,
  '23514',
  null,
  'validation failures block publication regardless of role'
);

reset role;
select * from finish();
rollback;
