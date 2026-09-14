-- pgTAP: 0047 — Ops users can see who else works in Ops, by name only; travelers cannot.
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f4700000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'researcher@0047.test'),
  ('f4700000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verifier@0047.test'),
  ('f4700000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0047.test');

insert into user_roles (user_id, role) values
  ('f4700000-0000-4000-8000-0000000000a1', 'researcher'),
  ('f4700000-0000-4000-8000-0000000000a2', 'verifier');

update profiles set display_name = 'Veda the verifier' where id = 'f4700000-0000-4000-8000-0000000000a2';
-- The sign-up trigger (0009) fills a display name in; this colleague has cleared theirs.
update profiles set display_name = null where id = 'f4700000-0000-4000-8000-0000000000a1';

create or replace function t47_as(p_user uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', 'authenticated')::text);
end;
$$;

select t47_as('f4700000-0000-4000-8000-0000000000a1');
select is(
  (select label from ops_colleagues() where user_id = 'f4700000-0000-4000-8000-0000000000a2'),
  'Veda the verifier', 'a researcher sees a colleague by their display name');
select is(
  (select label from ops_colleagues() where user_id = 'f4700000-0000-4000-8000-0000000000a1'),
  'researcher@0047.test', 'and by email when they have not set one');
select ok(
  not exists (select 1 from ops_colleagues() where user_id = 'f4700000-0000-4000-8000-0000000000a3'),
  'travelers are never listed');

reset role;
select t47_as('f4700000-0000-4000-8000-0000000000a3');
select throws_ok($$ select * from ops_colleagues() $$, '42501', null,
  'a traveler cannot list Ops');
reset role;

select * from finish();
rollback;
