-- 0017_travel_estimates_exposure.sql — cached travel legs, for the engine.
--
-- `travel_estimates` has been Ops-only since 0008, and the journey engine reads it to put
-- travel between two items on the clock (`travelMinutes`, B-016). Without a traveler path
-- to it every journey schedules with ZERO travel time between places — which is precisely
-- the silent wrongness the engine exists to prevent, and it would look completely normal
-- on screen.
--
-- The same shape of gap as OPEN-009: something the engine needs, with no way for the
-- person it serves to obtain it.
--
-- WHAT THIS EXPOSES. Derived, cached geometry between two PUBLISHED places: a distance, a
-- duration and a mode. Nothing personal, nothing unpublished — the join to
-- `v_published_places` on both ends is what keeps it that way, so an estimate can never
-- become a way to learn that an unpublished place exists, or where it is.
--
-- `provider` and `computed_at` are deliberately NOT exposed. Which routing vendor produced
-- a number is an operational detail; a traveler needs the number, and TRD §5.5 has the
-- engine label a fallback estimate rather than the data doing it.

create view v_published_travel_estimates as
select
  t.from_place_id,
  t.to_place_id,
  t.mode,
  t.distance_m,
  t.duration_seconds
from travel_estimates t
join v_published_places f on f.id = t.from_place_id
join v_published_places p on p.id = t.to_place_id;

comment on view v_published_travel_estimates is
  'Cached travel legs between two PUBLISHED places (TRD §4.4, engine input). '
  'No provider or timestamp: a traveler needs the number, not which vendor produced it.';

grant select on v_published_travel_estimates to anon, authenticated;
