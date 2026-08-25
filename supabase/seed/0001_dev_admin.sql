-- Local development fixtures. Loaded by `supabase db reset` AFTER migrations.
--
-- LOCAL ONLY. Never applied to preview or production: `supabase db push` applies
-- migrations, not seeds. The password below is a well-known local development credential
-- and is deliberately not a secret — do not copy this pattern anywhere that reaches a real
-- environment, and never add a seeded account to production.
--
-- Two accounts, both with Ops roles (TRD §11.2 Day 4, "Seed an admin user"):
--
--   admin@mandhira.local     admin     — for building and using the Ops app
--   ops-e2e@mandhira.local   reviewer  — reserved for the E2E suite
--
-- They are separate on purpose. Magic links are found by searching the mail catcher for an
-- address, and the newest message wins; two tests signing in as the same person race for
-- each other's links. A second account gives the auth-gate spec its own mailbox, and
-- incidentally proves a non-admin Ops role can get in too.

do $$
declare
  seed_user record;
begin
  for seed_user in
    select *
    from (values
      ('00000000-0000-4000-8000-00000000ad11'::uuid, 'admin@mandhira.local',   'Local Admin',    'admin'::ops_role_enum),
      ('00000000-0000-4000-8000-00000000e2e1'::uuid, 'ops-e2e@mandhira.local', 'E2E Reviewer',   'reviewer'::ops_role_enum)
    ) as t(id, email, display_name, role)
  loop
    if exists (select 1 from auth.users u where u.id = seed_user.id) then
      continue;
    end if;

    -- The empty-string token columns are NOT optional. GoTrue scans them into Go `string`
    -- values, and a NULL fails with "converting NULL to string is unsupported" — which
    -- surfaces as an opaque 500 "Database error querying schema" on every sign-in attempt.
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token,
      created_at, updated_at
    )
    values (
      seed_user.id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      seed_user.email,
      crypt('mandhira-local-dev', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', seed_user.display_name, 'locale', 'en'),
      '', '', '', '', '', '', '', '',
      now(),
      now()
    );

    -- Required for password sign-in to work against the local GoTrue.
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), seed_user.id, seed_user.id::text, 'email',
      jsonb_build_object('sub', seed_user.id::text, 'email', seed_user.email, 'email_verified', true),
      now(), now(), now()
    );

    -- The profile row arrives via the on_auth_user_created trigger (0009); the role is
    -- what makes the account useful.
    insert into user_roles (user_id, role) values (seed_user.id, seed_user.role)
    on conflict do nothing;

    raise notice 'Seeded % (%) / mandhira-local-dev', seed_user.email, seed_user.role;
  end loop;
end;
$$;
