-- 0023_live_conditions_exposure.sql — live conditions on the traveler read surface.
--
-- OPEN-009 deliberately left `live_feed_readings` closed with the note "reopen when a
-- feature needs one — opening a surface before something reads it is how nobody notices it
-- was opened too far". B-031 is that feature, so this opens it, and no wider.
--
-- WHAT PRD F10 DEMANDS OF THIS VIEW, and why it is shaped as it is:
--
--   - "Never show a live value without provider and timestamp." Both are columns here, not
--     optional extras, so a caller physically cannot render a value without them.
--   - "Never show illustrative or placeholder data in a live slot." So there is no default
--     row and no synthesised reading: a destination with no enabled feed returns nothing,
--     and the UI says nothing rather than something reassuring.
--   - PRD-DYN-003's outage fallback needs the LAST KNOWN reading even when the latest
--     attempt failed — so `unavailable` readings are exposed too, and carry their status.
--     A traveler is told what we last knew and when, not left with a blank.
--
-- Only the newest reading per feed. A traveler is answering "what is it like now", and a
-- history of hourly polls is Ops's question, not theirs.

create or replace view v_published_live_conditions as
select distinct on (c.id)
  c.id            as feed_config_id,
  c.destination_id,
  c.feed_kind,
  c.provider,
  c.refresh_minutes,
  r.id            as reading_id,
  r.read_at,
  r.status,
  r.payload,
  r.affects_entity_ids,
  /*
   * Whether the reading is older than its own feed allows.
   *
   * Computed here rather than in the app because the refresh interval lives here, and a
   * client comparing timestamps against a hard-coded interval would drift the moment an
   * operator changed one. Two intervals of grace before calling it stale — one missed poll
   * is a hiccup, two is a pattern.
   */
  (r.read_at < now() - make_interval(mins => c.refresh_minutes * 2)) as is_stale
from live_feed_configs c
join live_feed_readings r on r.feed_config_id = c.id
where c.is_enabled
order by c.id, r.read_at desc;

comment on view v_published_live_conditions is
  'The newest reading per enabled feed, with provider and timestamp always present '
  '(PRD F10). Includes `unavailable` readings so PRD-DYN-003 can show the last known '
  'value rather than a blank. Opened for B-031 — see OPEN-009 and the 0023 header.';

-- ══════════════════════════════════════════════════════════════════════════════
-- Grants, explicit rather than inherited from PUBLIC.
--
-- SELECT only, and only on the view. The base tables stay closed: a traveler has no
-- business reading a feed's credentials out of `live_feed_configs.config`, which is
-- exactly why that column is not in the view.
-- ══════════════════════════════════════════════════════════════════════════════

revoke all on v_published_live_conditions from public;
grant select on v_published_live_conditions to anon, authenticated;

-- The poller reads configs and writes readings ordered by feed and time; both indexes
-- serve the view's `distinct on … order by` as well.
create index if not exists live_feed_readings_config_time_idx
  on live_feed_readings (feed_config_id, read_at desc);

create index if not exists live_feed_configs_destination_idx
  on live_feed_configs (destination_id)
  where is_enabled;
