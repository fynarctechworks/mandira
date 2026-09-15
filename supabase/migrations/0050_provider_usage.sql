-- 0050_provider_usage.sql — MON-01: provider usage against free quotas (TRD §13 cost controls).
--
-- TRD §13: "alert at 70 % of any free quota (Ops dashboard reads provider usage endpoints
-- where available)". Most of these free tiers publish no usage endpoint — Gemini's has none at
-- all — so the count is our own:
--
--   * `provider_quotas` — each free tier's limit, as data rather than code, per day or month.
--   * `provider_usage` — calls per provider per UTC day, written by the server only.
--   * `record_provider_usage()` — the server's counter, service role only.
--   * `provider_usage_status()` — used against quota for the current period, for Ops and for
--     the daily alert (0046). Gemini is counted from `ai_calls`, which already logs every real
--     call and never a cache hit, so nothing is counted twice.
--
-- Map tiles load in the browser, so the server cannot count them; MapTiler's own dashboard is
-- the record there.

create table provider_quotas (
  provider   text not null,
  period     text not null check (period in ('day', 'month')),
  label      text not null,
  quota      integer not null check (quota > 0),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

comment on table provider_quotas is
  'Free-tier limits per provider and period (MON-01, 0050). Update a row when a provider changes its free tier.';

create trigger provider_quotas_set_updated_at
  before update on provider_quotas for each row execute function set_updated_at();

alter table provider_quotas enable row level security;
grant select on provider_quotas to authenticated;
create policy provider_quotas_ops_read on provider_quotas
  for select to authenticated using (is_ops());

insert into provider_quotas (provider, period, label, quota, note) values
  ('google_ai', 'day', 'Gemini (AI)', 250,
   'Requests per day for gemini-2.5-flash on the free tier. Google changes free-tier limits; check AI Studio and update this row.'),
  ('openrouteservice', 'day', 'OpenRouteService routing', 2000,
   'Directions requests per day on the free plan.'),
  ('resend', 'day', 'Resend email', 100,
   'Emails per day on the free plan. Sign-in links that Supabase Auth sends through Resend are not counted here.'),
  ('resend', 'month', 'Resend email', 3000,
   'Emails per month on the free plan. Sign-in links that Supabase Auth sends through Resend are not counted here.');

create table provider_usage (
  provider text not null,
  day      date not null,
  calls    integer not null default 0 check (calls >= 0),
  primary key (provider, day)
);

comment on table provider_usage is
  'Calls per provider per UTC day, counted by the server (MON-01, 0050). No user, request or content.';

-- No client grants at all: written by the server, read through provider_usage_status().
alter table provider_usage enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- Counting
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function record_provider_usage(p_provider text, p_calls integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if request_is_client() then
    raise exception 'Provider usage is recorded by the server' using errcode = 'insufficient_privilege';
  end if;

  if p_provider is null or p_calls is null or p_calls <= 0 then
    return;
  end if;

  if not exists (select 1 from provider_quotas q where q.provider = p_provider) then
    raise exception 'No quota is configured for provider %', p_provider using errcode = 'check_violation';
  end if;

  insert into provider_usage (provider, day, calls)
  values (p_provider, (now() at time zone 'UTC')::date, p_calls)
  on conflict (provider, day) do update set calls = provider_usage.calls + excluded.calls;
end;
$$;

revoke all on function record_provider_usage(text, integer) from public, anon, authenticated;
grant execute on function record_provider_usage(text, integer) to service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- Where each provider stands
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Every configured quota with what has been used in its current period (UTC day or month),
 * the share used, and whether that share is at TRD §13's 70 % line. For Ops users and for the
 * server's daily alert; travelers get nothing.
 */
create or replace function provider_usage_status()
returns table (
  provider text,
  period text,
  label text,
  quota integer,
  used bigint,
  share integer,
  near_limit boolean,
  note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if request_is_client() and not is_ops() then
    raise exception 'Only Ops can see provider usage' using errcode = 'insufficient_privilege';
  end if;

  return query
  with bounds as (
    select q.provider, q.period, q.label, q.quota, q.note,
           case q.period
             when 'day' then date_trunc('day', now() at time zone 'UTC')
             else date_trunc('month', now() at time zone 'UTC')
           end as starts
      from provider_quotas q
  )
  select b.provider, b.period, b.label, b.quota, u.used,
         (u.used * 100 / b.quota)::integer as share,
         u.used * 100 >= b.quota::bigint * 70 as near_limit,
         b.note
    from bounds b
    cross join lateral (
      select case
               when b.provider = 'google_ai' then (
                 select count(*) from ai_calls a
                  where a.provider = 'google' and (a.created_at at time zone 'UTC') >= b.starts)
               else (
                 select coalesce(sum(p.calls), 0)::bigint from provider_usage p
                  where p.provider = b.provider and p.day >= b.starts::date)
             end as used
    ) u
   order by b.label, b.period;
end;
$$;

revoke all on function provider_usage_status() from public, anon;
grant execute on function provider_usage_status() to authenticated, service_role;
