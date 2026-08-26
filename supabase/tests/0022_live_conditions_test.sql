-- pgTAP: live conditions carry their provenance, and outages stay visible
-- (B-031, PRD F10, PRD-DYN-001/003).
--
-- PRD F10 makes two rules that are structural rather than cosmetic, and this is where they
-- are held:
--
--   1. Never show a live value without a provider and a timestamp. Both are columns on the
--      view, so a caller cannot render one without them.
--   2. Never show illustrative or placeholder data in a live slot. No default row exists —
--      a destination with no enabled feed returns nothing at all.
--
-- Plus PRD-DYN-003: an `unavailable` reading must still be READABLE, or the UI cannot say
-- "showing last known (as of …)" and would show a blank instead — which invites the
-- assumption that conditions are fine.

begin;
select plan(10);

create function test_become_anon() returns void
language plpgsql as $fn$
begin
  execute 'set local role anon';
  execute 'set local request.jwt.claims = ''{"role":"anon"}''';
end;
$fn$;

-- A destination of our own, so the assertions do not count the fixture's.
insert into destinations (id, slug, name_i18n, status, published_at)
values ('b7000000-0000-4000-8000-000000000001', 'feed-test-destination',
        '{"en":"Feed Test (fixture)"}'::jsonb, 'published', now());

insert into live_feed_configs (id, destination_id, feed_kind, provider, refresh_minutes, is_enabled)
values
  ('b8000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
   'weather', 'Open-Meteo', 120, true),
  -- Disabled: exists in Ops, invisible to travelers.
  ('b8000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
   'transport', 'Nobody', 60, false);

insert into live_feed_readings (feed_config_id, read_at, status, payload)
values
  ('b8000000-0000-4000-8000-000000000001', now() - interval '3 hours', 'ok',
   '{"hours":[{"at":"2026-10-12T06:00","temperatureC":24}]}'::jsonb),
  ('b8000000-0000-4000-8000-000000000001', now() - interval '5 minutes', 'ok',
   '{"hours":[{"at":"2026-10-12T07:00","temperatureC":27}]}'::jsonb);

-- ── Provider and timestamp are structural ───────────────────────────────────
select has_column('v_published_live_conditions', 'provider',
  'the view carries a provider — PRD F10 forbids a live value without one');

select has_column('v_published_live_conditions', 'read_at',
  'and a timestamp, for the same reason');

-- The feed's credentials must never reach a traveler; the view has no `config` column.
select hasnt_column('v_published_live_conditions', 'config',
  'and NOT the feed config, which can hold credentials');

-- ── A guest reads it ────────────────────────────────────────────────────────
select test_become_anon();

select is(
  (select count(*)::int from v_published_live_conditions
    where destination_id = 'b7000000-0000-4000-8000-000000000001'),
  1,
  'only the ENABLED feed is visible — a disabled one exists in Ops and nowhere else'
);

-- Only the newest reading per feed: a traveler is answering "what is it like now", and a
-- history of polls is Ops's question.
select is(
  (select (payload -> 'hours' -> 0 ->> 'temperatureC')
     from v_published_live_conditions
    where destination_id = 'b7000000-0000-4000-8000-000000000001'),
  '27',
  'and only its newest reading'
);

select is(
  (select is_stale from v_published_live_conditions
    where destination_id = 'b7000000-0000-4000-8000-000000000001'),
  false,
  'a reading inside its refresh interval is not stale'
);

-- ── The base tables stay closed ─────────────────────────────────────────────
select throws_ok(
  $$ select 1 from live_feed_configs $$,
  '42501',
  null,
  'a guest cannot read the feed configs themselves'
);

select throws_ok(
  $$ select 1 from live_feed_readings $$,
  '42501',
  null,
  'nor the raw reading history'
);

-- ── PRD-DYN-003: an outage stays readable ───────────────────────────────────
reset role;

insert into live_feed_readings (feed_config_id, read_at, status, payload)
values ('b8000000-0000-4000-8000-000000000001', now(), 'unavailable',
        '{"reason":"provider_unavailable"}'::jsonb);

select test_become_anon();

/*
 * The failure is VISIBLE, not skipped. If a broken poll wrote nothing, the last good
 * reading would look current indefinitely — the exact opposite of PRD-DYN-003's promise,
 * and the traveler would be reassured by silence.
 */
select is(
  (select status from v_published_live_conditions
    where destination_id = 'b7000000-0000-4000-8000-000000000001'),
  'unavailable',
  'an outage is readable, so the UI can say "showing last known" rather than nothing'
);

-- ── No feed, no row. Never a placeholder ────────────────────────────────────
select is_empty(
  $$ select 1 from v_published_live_conditions
      where destination_id = 'd0000000-0000-4000-8000-00000000f001' $$,
  'a destination with no enabled feed shows nothing at all — never placeholder weather'
);

select * from finish();
rollback;
