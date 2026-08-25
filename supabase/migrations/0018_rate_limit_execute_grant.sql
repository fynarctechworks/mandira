-- 0018_rate_limit_execute_grant.sql — let the rate limiter actually run.
--
-- BUG from 0012, found by B-019's first rate-limited route: `revoke all on function
-- consume_rate_limit(...) from public` also removed the implicit grant `service_role`
-- inherits through PUBLIC. `service_role` has BYPASSRLS but is not a superuser, so it had
-- no EXECUTE — every call raised, `rateLimit()` fell closed, and the route answered 429
-- with an empty `rate_limits` table.
--
-- Failing closed was the right choice (a limiter that fails open is not a limiter), and it
-- is why this surfaced as a refusal rather than as an unlimited door. But it means no
-- rate-limited route could ever have worked.
--
-- WHY NOTHING CAUGHT IT. `0010_ai_rate_limits_test` asserts that anon and authenticated
-- CANNOT execute it — and stops there. The allow half was never written, so a grant that
-- removed everyone's access looked exactly like a correctly locked-down one. The test in
-- that file now checks both directions.

grant execute on function consume_rate_limit(text, text, int, int) to service_role;

comment on function consume_rate_limit(text, text, int, int) is
  'Atomically increments and checks a fixed-window counter (TRD §6.2). '
  'The check and increment share one statement so concurrent requests cannot both pass. '
  'EXECUTE is granted to service_role ONLY: a signed-in user able to call this directly '
  'could burn another user''s quota by passing their key.';
