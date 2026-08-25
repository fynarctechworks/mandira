-- pgTAP: TRD §6.2 rate limits and §7.3 AI observability/cache (TRD-SEC-001, TRD-AI-004).
--
-- Two things this file exists to prove, because neither is visible by reading the schema:
--   1. The rate limiter actually refuses at the limit, and its counter is atomic.
--   2. No client role can read or write any of these three tables. A rate limiter a client
--      can read is one it can plan around; an AI log a client can read is a prompt archive.

begin;
select plan(34);

-- ── Shape ───────────────────────────────────────────────────────────────────
select has_table('public', 'ai_calls', 'ai_calls exists');
select has_table('public', 'ai_cache', 'ai_cache exists');
select has_table('public', 'rate_limits', 'rate_limits exists');
select has_type('public', 'ai_task_enum', 'ai_task_enum exists');

select is(
  (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'ai_task_enum'
  ),
  array['intent_extract', 'explain', 'search_query', 'conversational_plan',
        'extract_knowledge', 'detect_changes', 'contradiction_check',
        'suggest_translation', 'classify', 'embed'],
  'ai_task_enum carries exactly the TRD §7.2 tasks'
);

-- TRD §7.3.4 is explicit: no user identifiers in the AI log. If someone adds one, this
-- fails before it reaches a database that holds real prompts.
select hasnt_column('public', 'ai_calls', 'user_id', 'ai_calls has no user_id');
select hasnt_column('public', 'ai_calls', 'session_id', 'ai_calls has no session_id');
select hasnt_column('public', 'ai_calls', 'prompt', 'ai_calls stores no prompt text');
select hasnt_column('public', 'ai_calls', 'output', 'ai_calls stores no output text');

select col_is_pk(
  'public', 'ai_cache', array['task', 'grounding_hash', 'input_hash'],
  'ai_cache is keyed by (task, grounding_hash, input_hash) per TRD §7.3.6'
);
select col_is_pk(
  'public', 'rate_limits', array['scope', 'key', 'window_start'],
  'rate_limits is keyed by (scope, key, window_start) per TRD §6.2'
);

-- ── The limiter refuses ─────────────────────────────────────────────────────
select is(
  (select allowed from consume_rate_limit('intent_extract', 'u1', 3, 3600)),
  true,
  'the first call is allowed'
);
select is(
  (select remaining from consume_rate_limit('intent_extract', 'u1', 3, 3600)),
  1,
  'remaining counts down as calls are consumed'
);
select is(
  (select allowed from consume_rate_limit('intent_extract', 'u1', 3, 3600)),
  true,
  'the call that reaches the limit exactly is still allowed'
);
select is(
  (select allowed from consume_rate_limit('intent_extract', 'u1', 3, 3600)),
  false,
  'the call past the limit is refused'
);
select is(
  (select remaining from consume_rate_limit('intent_extract', 'u1', 3, 3600)),
  0,
  'remaining never goes negative'
);

-- One caller exhausting a scope must not affect another.
select is(
  (select allowed from consume_rate_limit('intent_extract', 'u2', 3, 3600)),
  true,
  'a different key has its own counter'
);
select is(
  (select allowed from consume_rate_limit('search', 'u1', 3, 3600)),
  true,
  'a different scope has its own counter'
);

select ok(
  (select reset_at from consume_rate_limit('search', 'u1', 3, 3600)) > now(),
  'reset_at is in the future, so Retry-After can be derived from it'
);

select is(
  (select count(*)::int from rate_limits where scope = 'intent_extract' and key = 'u1'),
  1,
  'every call in one window shares a single row'
);

select throws_ok(
  $$ select consume_rate_limit('intent_extract', 'u1', 0, 3600) $$,
  'consume_rate_limit requires a positive limit and window',
  'a zero limit is rejected rather than silently blocking everything'
);

-- ── Pruning ─────────────────────────────────────────────────────────────────
insert into rate_limits (scope, key, window_start, count)
values ('search', 'old', now() - interval '10 days', 5);
select is(prune_rate_limits(), 1, 'prune_rate_limits removes rows past their retention');

insert into ai_cache (task, grounding_hash, input_hash, output, provider, model, expires_at)
values ('intent_extract', 'g1', 'i1', '{"ok":true}'::jsonb, 'google', 'gemini-2.5-flash',
        now() - interval '1 hour');
insert into ai_cache (task, grounding_hash, input_hash, output, provider, model)
values ('intent_extract', 'g1', 'i2', '{"ok":true}'::jsonb, 'google', 'gemini-2.5-flash');

select is(prune_ai_cache(), 1, 'prune_ai_cache removes only expired entries');
select is(
  (select count(*)::int from ai_cache), 1, 'the unexpired entry survives pruning'
);
select ok(
  (select expires_at from ai_cache where input_hash = 'i2') > now() + interval '23 hours',
  'a new cache entry defaults to a 24-hour life (TRD §7.3.6)'
);

-- ── Nobody but service_role gets in ─────────────────────────────────────────
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('ai_calls', 'ai_cache', 'rate_limits')),
  0,
  'none of the three tables has any policy, so RLS denies every client role'
);

select ok(
  (select relrowsecurity from pg_class where relname = 'ai_calls'),
  'RLS is enabled on ai_calls'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'ai_cache'),
  'RLS is enabled on ai_cache'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'rate_limits'),
  'RLS is enabled on rate_limits'
);

-- A SECURITY DEFINER function that anyone may execute is a hole around the policies above:
-- a signed-in user could burn someone else''s quota by passing their key.
-- BOTH directions. Asserting only the denials let 0012 revoke EXECUTE from service_role
-- as well, which looked exactly like a correctly locked-down function and meant no
-- rate-limited route could run at all (fixed in 0018).
select ok(
  has_function_privilege('service_role', 'consume_rate_limit(text, text, int, int)', 'execute'),
  'service_role CAN execute consume_rate_limit — the limiter has to be able to run'
);

select ok(
  not has_function_privilege('authenticated', 'consume_rate_limit(text, text, int, int)', 'execute'),
  'authenticated cannot execute consume_rate_limit'
);
select ok(
  not has_function_privilege('anon', 'consume_rate_limit(text, text, int, int)', 'execute'),
  'anon cannot execute consume_rate_limit'
);
select ok(
  not has_function_privilege('authenticated', 'prune_ai_cache()', 'execute'),
  'authenticated cannot execute prune_ai_cache'
);
select ok(
  not has_function_privilege('anon', 'prune_rate_limits(interval)', 'execute'),
  'anon cannot execute prune_rate_limits'
);

select * from finish();
rollback;
