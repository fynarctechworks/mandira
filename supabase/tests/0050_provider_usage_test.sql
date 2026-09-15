-- pgTAP: 0050 — the server counts provider calls, Ops and the server read usage against each
-- free quota, and travelers can do neither.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@0050.test'),
  ('f5000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveler@0050.test');

insert into user_roles (user_id, role) values ('f5000000-0000-4000-8000-0000000000a1', 'editor');

create or replace function t50_as(p_role text, p_user uuid) returns void language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', p_user, 'role', p_role)::text);
end;
$$;

create or replace function t50_used(p_provider text, p_period text) returns bigint language sql as $$
  select used from provider_usage_status() where provider = p_provider and period = p_period
$$;
grant execute on function t50_used(text, text) to authenticated, service_role;

select is(
  (select quota from provider_quotas where provider = 'resend' and period = 'month'),
  3000, 'free-tier limits are configuration rows');

-- ── Travelers ────────────────────────────────────────────────────────────────

select t50_as('authenticated', 'f5000000-0000-4000-8000-0000000000a2');
select throws_ok($$ select record_provider_usage('resend', 1) $$, '42501', null,
  'a traveler cannot count calls');
select throws_ok($$ select * from provider_usage_status() $$, '42501', null,
  'nor read usage');
select is((select count(*)::int from provider_quotas), 0, 'nor the quota rows');
reset role;

-- ── The server counts ────────────────────────────────────────────────────────

select t50_as('service_role', null);
select set_config('t50.ors', t50_used('openrouteservice', 'day')::text, true);
select set_config('t50.ai', t50_used('google_ai', 'day')::text, true);

select lives_ok($$ select record_provider_usage('openrouteservice', 3) $$, 'the server records three routing calls');
select is(t50_used('openrouteservice', 'day'), current_setting('t50.ors')::bigint + 3,
  'and today''s count rises by three');

select lives_ok($$ select record_provider_usage('openrouteservice', 0) $$, 'a zero count is ignored');
select throws_ok($$ select record_provider_usage('unknown_provider', 1) $$, '23514', null,
  'a provider without a quota is refused, so a typo cannot count silently');
reset role;

insert into ai_calls (task, provider, model, ok)
values ((enum_range(null::ai_task_enum))[1], 'google', 'gemini-2.5-flash', true);

select t50_as('service_role', null);
select is(t50_used('google_ai', 'day'), current_setting('t50.ai')::bigint + 1,
  'Gemini is counted from the AI call log');

select lives_ok($$ select record_provider_usage('openrouteservice', 2000) $$, 'a busy day of routing');
select ok(
  (select near_limit and share >= 70 from provider_usage_status()
    where provider = 'openrouteservice' and period = 'day'),
  'is flagged at 70 % of the free quota');
reset role;

-- ── Ops ──────────────────────────────────────────────────────────────────────

select t50_as('authenticated', 'f5000000-0000-4000-8000-0000000000a1');
select is((select count(*)::int from provider_usage_status()), 4,
  'an Ops user sees every configured quota');
reset role;

select * from finish();
rollback;
