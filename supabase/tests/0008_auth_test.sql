-- pgTAP: profile provisioning and separation of duties (AUTH-04, AUTH-05, PRD-OPS-WF-009).

begin;
select plan(9);

select has_function('public', 'handle_new_user', 'handle_new_user() exists');
select has_function('public', 'enforce_approval_separation', 'enforce_approval_separation() exists');

-- ── AUTH-04: every new auth user gets a profile, whatever route created them ──
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('aa000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'newbie@example.test',
        '{"full_name":"New Bie","locale":"te"}'::jsonb);

select is(
  (select display_name from profiles where id = 'aa000000-0000-4000-8000-000000000001'),
  'New Bie',
  'the profile trigger copies the display name from provider metadata'
);
select is(
  (select locale from profiles where id = 'aa000000-0000-4000-8000-000000000001'),
  'te',
  'a known locale from metadata is honoured'
);

-- An unknown locale must not fail the sign-up; it falls back to en.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('aa000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'martian@example.test',
        '{"locale":"xx"}'::jsonb);

select is(
  (select locale from profiles where id = 'aa000000-0000-4000-8000-000000000002'),
  'en',
  'an unknown locale falls back to en instead of failing sign-up on the FK'
);
select is(
  (select display_name from profiles where id = 'aa000000-0000-4000-8000-000000000002'),
  'martian',
  'with no name in metadata, the local part of the address is used'
);

-- ── AUTH-05: separation of duties on approval (PRD-OPS-WF-009) ────────────────
insert into auth.users (id, instance_id, aud, role, email)
values ('aa000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'editor@example.test');

insert into destinations (id, slug, name_i18n, status)
values ('bb000000-0000-4000-8000-000000000001', 'sod-test', '{"en":"SoD"}'::jsonb, 'draft');

-- Record an edit by the editor, so they are the entity's last changed_by.
insert into entity_versions (entity_table, entity_id, version, snapshot, changed_by)
values ('destinations', 'bb000000-0000-4000-8000-000000000001', 99, '{}'::jsonb,
        'aa000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ insert into review_tasks (task_type, entity_table, entity_id, status, completed_by)
     values ('approve', 'destinations', 'bb000000-0000-4000-8000-000000000001', 'done',
             'aa000000-0000-4000-8000-000000000003') $$,
  '23514',
  null,
  'the person who last changed an entity cannot also approve it'
);

select lives_ok(
  $$ insert into review_tasks (task_type, entity_table, entity_id, status, completed_by)
     values ('approve', 'destinations', 'bb000000-0000-4000-8000-000000000001', 'done',
             'aa000000-0000-4000-8000-000000000001') $$,
  'a different person may approve it'
);

-- The constraint applies only to approve tasks being completed; ordinary queue work is
-- untouched, including by the same person who made the edit.
select lives_ok(
  $$ insert into review_tasks (task_type, entity_table, entity_id, status, completed_by)
     values ('review', 'destinations', 'bb000000-0000-4000-8000-000000000001', 'done',
             'aa000000-0000-4000-8000-000000000003') $$,
  'a review task is not subject to the approval separation rule'
);

select * from finish();
rollback;
