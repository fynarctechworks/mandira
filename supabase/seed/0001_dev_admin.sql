-- Local development fixtures. Loaded by `supabase db reset` AFTER migrations.
--
-- LOCAL ONLY. This file is never applied to preview or production: `supabase db push`
-- applies migrations, not seeds. The password below is a well-known local development
-- credential and is deliberately not a secret — do not copy this pattern anywhere that
-- reaches a real environment, and never add a seeded account to production.
--
-- Gives you an Ops admin to sign in with while building the Ops app (TRD §11.2 Day 4,
-- "Seed an admin user").

do $$
declare
  admin_id uuid := '00000000-0000-4000-8000-00000000ad11';
begin
  if exists (select 1 from auth.users where id = admin_id) then
    return;
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
    admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@mandhira.local',
    crypt('mandhira-local-dev', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Local Admin","locale":"en"}'::jsonb,
    '', '', '', '', '', '', '', '',
    now(),
    now()
  );

  -- Required for password sign-in to work against the local GoTrue.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), admin_id, admin_id::text, 'email',
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@mandhira.local', 'email_verified', true),
    now(), now(), now()
  );

  -- The profile row arrives via the on_auth_user_created trigger (0009); the role is
  -- what makes this account useful.
  insert into user_roles (user_id, role) values (admin_id, 'admin')
  on conflict do nothing;

  raise notice 'Seeded local Ops admin: admin@mandhira.local / mandhira-local-dev';
end;
$$;
