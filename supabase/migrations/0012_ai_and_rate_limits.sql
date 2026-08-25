-- 0012_ai_and_rate_limits.sql — TRD §6.2 rate limits, §7.3 AI observability and cache.
--
-- Three server-only tables. None of them gets an anon or authenticated policy: RLS stays
-- on and empty, so `service_role` (used only in route handlers and Edge Functions, TRD
-- §6.1) is the sole writer and reader. A rate limiter a client can read is a rate limiter
-- a client can plan around, and an AI log a client can read is a prompt archive.

-- ══════════════════════════════════════════════════════════════════════════════
-- ai_task_enum — the tasks of TRD §7.2, and no others.
--
-- An enum rather than free text so a typo in a task name cannot quietly split the cost
-- and quality figures across two spellings, which is exactly the sort of thing nobody
-- notices until they are trying to work out why usage looks low.
-- ══════════════════════════════════════════════════════════════════════════════

create type ai_task_enum as enum (
  'intent_extract',
  'explain',
  'search_query',
  'conversational_plan',
  'extract_knowledge',
  'detect_changes',
  'contradiction_check',
  'suggest_translation',
  'classify',
  'embed'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ai_calls — TRD §7.3.4. Observability, deliberately anonymous.
--
-- No user id, no session id, no prompt text and no output text. The point of this table
-- is to answer "what is this costing, how often does it fail, how slow is it" — none of
-- which needs to know who asked. `grounding_hash` is enough to correlate a call with the
-- cache entry it produced without storing what was in it.
-- ══════════════════════════════════════════════════════════════════════════════

create table ai_calls (
  id             uuid primary key default gen_random_uuid(),
  task           ai_task_enum not null,
  provider       text not null,
  model          text not null,
  tokens_in      int,
  tokens_out     int,
  latency_ms     int,
  grounding_hash text,
  ok             boolean not null,
  -- A short machine code ("timeout", "not_grounded", "schema_mismatch"), never the
  -- provider's message: those quote the prompt back, which would put user text in here.
  error_code     text,
  -- True when this call was the fallback provider, so a provider outage is visible as a
  -- shift in this column rather than only as a latency bump.
  is_fallback    boolean not null default false,
  created_at     timestamptz not null default now()
);

comment on table ai_calls is
  'AI call log with NO user identifiers (TRD §7.3.4). Never store prompt or output text here.';
comment on column ai_calls.error_code is
  'Short machine code. Provider messages quote the prompt back and must not be stored.';

create index ai_calls_task_created_idx on ai_calls (task, created_at desc);
create index ai_calls_failures_idx on ai_calls (created_at desc) where not ok;

alter table ai_calls enable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- ai_cache — TRD §7.3.6. Identical (task, grounding_hash, input_hash) within 24 h.
--
-- Keyed by hashes rather than by the input itself: the same question asked by two people
-- should hit the same entry, and neither of them should be recoverable from this table.
-- ══════════════════════════════════════════════════════════════════════════════

create table ai_cache (
  task           ai_task_enum not null,
  grounding_hash text not null,
  input_hash     text not null,
  output         jsonb not null,
  provider       text not null,
  model          text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours',
  primary key (task, grounding_hash, input_hash)
);

comment on table ai_cache is
  'AI response cache (TRD §7.3.6). Hash-keyed so no input text is recoverable from it.';
comment on column ai_cache.grounding_hash is
  'Hash of the grounding input. Changing the published knowledge changes it, so a cache '
  'entry can never outlive the facts it was grounded in.';

create index ai_cache_expiry_idx on ai_cache (expires_at);

alter table ai_cache enable row level security;

/*
 * Expired rows are deleted rather than left to be filtered on read.
 *
 * A read-time filter would keep working while the table grew without limit; a caller who
 * forgot the filter would then serve a stale answer with no error to notice. Wired to
 * pg_cron with the other jobs (TRD §5.4).
 */
create or replace function prune_ai_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from ai_cache where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function prune_ai_cache() is
  'Deletes expired ai_cache rows. Scheduled with the other pg_cron jobs (TRD §5.4).';

-- ══════════════════════════════════════════════════════════════════════════════
-- rate_limits — TRD §6.2, keyed by (scope, key, window_start).
--
-- Fixed windows, not a sliding log: one row per caller per window instead of one row per
-- request. At this scale the extra precision of a sliding window would cost far more
-- storage than it buys, and the §6.2 limits are all round numbers per hour or per day.
-- ══════════════════════════════════════════════════════════════════════════════

create table rate_limits (
  scope        text not null,
  -- A user id, an anon session id, an email, or the literal 'global'. Never an IP: those
  -- are personal data under DPDP, and `ip_hash` exists for the audit trail that needs one.
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (scope, key, window_start)
);

comment on table rate_limits is 'Fixed-window rate limit counters (TRD §6.2).';
comment on column rate_limits.key is
  'User id, anon session id, email, or ''global''. Never a raw IP address.';

create index rate_limits_window_idx on rate_limits (window_start);

create trigger rate_limits_set_updated_at
  before update on rate_limits for each row execute function set_updated_at();

alter table rate_limits enable row level security;

/*
 * Consume one unit of a rate limit, atomically.
 *
 * The check and the increment happen in a single statement on purpose. Reading the count
 * in the application and writing it back would let two concurrent requests both read 9,
 * both decide they are under a limit of 10, and both proceed — which is precisely the
 * case a rate limiter exists for.
 *
 * Returns the decision plus what the caller needs for a 429: how many remain, and when
 * the window resets (`Retry-After`).
 */
create or replace function consume_rate_limit(
  p_scope           text,
  p_key             text,
  p_limit           int,
  p_window_seconds  int
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        int;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'consume_rate_limit requires a positive limit and window';
  end if;

  -- Floor the clock to the window, so every caller in the same window shares a row.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (scope, key, window_start, count)
  values (p_scope, p_key, v_window_start, 1)
  on conflict (scope, key, window_start)
  do update set count = rate_limits.count + 1
  returning rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

comment on function consume_rate_limit(text, text, int, int) is
  'Atomically increments and checks a fixed-window counter (TRD §6.2). '
  'The check and increment share one statement so concurrent requests cannot both pass.';

/*
 * Counters outlive their window by design — long enough to debug a complaint, not long
 * enough to become a log of who did what when.
 */
create or replace function prune_rate_limits(p_older_than interval default interval '2 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limits where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function prune_rate_limits(interval) is
  'Deletes rate-limit rows older than the given age. Scheduled with the pg_cron jobs.';

-- Definer functions are called from server routes running as `service_role`, which already
-- bypasses RLS. Granting execute to `authenticated` as well would let any signed-in user
-- burn another user''s quota by calling the RPC with their key.
revoke all on function consume_rate_limit(text, text, int, int) from public, anon, authenticated;
revoke all on function prune_ai_cache() from public, anon, authenticated;
revoke all on function prune_rate_limits(interval) from public, anon, authenticated;
