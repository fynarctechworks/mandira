-- pgTAP: 0054 — the account holder is an adult, and the DPDP text is admin-only but public.
begin;
select plan(13);

-- Helpers first, while we still own the schema (the 0030 pattern).
create or replace function t54_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

create or replace function t54_as_anon() returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$$;

create or replace function t54_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'reset request.jwt.claims';
end;
$$;

grant execute on function t54_as(uuid), t54_as_anon(), t54_owner() to anon, authenticated;

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5400000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0054.test'),
  ('f5400000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@0054.test'),
  ('f5400000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0054.test');
insert into user_roles (user_id, role) values
  ('f5400000-0000-4000-8000-0000000000a2', 'admin'),
  ('f5400000-0000-4000-8000-0000000000a3', 'editor');

-- ── PRD-PRIV-004: the person holding the account ─────────────────────────────

select has_column('profiles', 'adult_confirmed_at',
  'a profile records when the holder said they are 18 or older');

insert into traveler_profiles (owner_user_id, label, age_band, is_self)
values ('f5400000-0000-4000-8000-0000000000a1', 'Me', 'adult', true);
select pass('an adult can hold an account');

select throws_ok(
  $$insert into traveler_profiles (owner_user_id, label, age_band, is_self)
    values ('f5400000-0000-4000-8000-0000000000a1', 'Someone', 'child', true)$$,
  '23514',
  null,
  'a child cannot be the person holding the account');

insert into traveler_profiles (owner_user_id, label, age_band, is_self)
values ('f5400000-0000-4000-8000-0000000000a1', 'My daughter', 'child', false);
select pass('a child travels as a companion, which is what an age band is for');

select throws_ok(
  $$update traveler_profiles set age_band = 'child'
     where owner_user_id = 'f5400000-0000-4000-8000-0000000000a1' and is_self$$,
  '23514',
  null,
  'and the holder cannot become a child later either');

select lives_ok(
  $$update traveler_profiles set age_band = 'senior'
     where owner_user_id = 'f5400000-0000-4000-8000-0000000000a1' and is_self$$,
  'a senior holder is left alone');

-- ── PRD-PRIV-005: the notice has to be readable before consenting ────────────

select is(
  (select count(*)::int from legal_notices
    where key in ('consent_notice', 'grievance_contact', 'privacy_policy')),
  3, 'the three keys exist from the start');

/*
 * Emptied here rather than assumed empty: the development seed publishes placeholder text
 * so that sign-in works on a developer's machine, and a test that depended on the seed's
 * contents would be testing the seed. Rolled back with everything else.
 */
update legal_notices set body_i18n = '{}'::jsonb;

select is(
  (select count(*)::int from legal_notices where coalesce(body_i18n ->> 'en', '') <> ''),
  0, 'an unwritten notice is empty, because inventing legal wording would be worse');

select ok(not legal_notices_ready(), 'so the app knows it is not ready to launch');

select t54_as_anon();
select is(
  (select count(*)::int from legal_notices where key = 'consent_notice'),
  1, 'a signed-out visitor can read the notice they are being asked to accept');

-- ── Only an admin writes a statement in the company name ─────────────────────

select t54_as('f5400000-0000-4000-8000-0000000000a3');
with attempt as (
  update legal_notices set body_i18n = '{"en":"Editor wrote this"}'
   where key = 'grievance_contact' returning 1
)
select is((select count(*)::int from attempt), 0,
  'an editor cannot write the grievance contact');

select t54_as('f5400000-0000-4000-8000-0000000000a2');
with attempt as (
  update legal_notices set body_i18n = '{"en":"Grievance Officer, name@example.test"}'
   where key = 'grievance_contact' returning 1
)
select is((select count(*)::int from attempt), 1, 'an admin can');

select t54_owner();
update legal_notices set body_i18n = '{"en":"What we collect and why."}' where key = 'consent_notice';
select ok(legal_notices_ready(), 'with both published, the app is ready to ask for consent');

select * from finish();
rollback;
