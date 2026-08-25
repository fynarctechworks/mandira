-- 0021_place_coordinates_exposure.sql — latitude and longitude on the traveler read surface.
--
-- `places.location` is a `geography`, and PostgREST hands it back as WKB hex
-- (`0101000020E6...`). That is fine for PostGIS and useless to a browser, so nothing in the
-- traveler app could put a place on a map or hand it to a maps application — MAPS-03 had no
-- coordinates to hand off.
--
-- Exposed as two plain numbers rather than GeoJSON: the consumers are a deep link and, later,
-- a MapLibre marker, and both want scalars. `location` itself stays on the view for anything
-- that genuinely wants the geometry.
--
-- ST_X is LONGITUDE and ST_Y is LATITUDE — x/y, not the lat/long order people say out loud.
-- Getting them the wrong way round yields a coordinate that is confidently somewhere else,
-- which a map renders without complaint.
--
-- Only the published view changes. A place still has to pass the gate to have coordinates
-- read: an unverified location is exactly the kind of fact PRD F1 refuses to show.

create or replace view v_published_places as
select
  p.id, p.destination_id, p.slug, p.name_i18n, p.place_type, p.facility_subtype,
  p.location, p.address, p.summary_i18n,
  p.opening_schedule, p.closure_rules_i18n, p.entry_requirements_i18n, p.dress_code_i18n,
  p.visit_duration_min_minutes, p.visit_duration_likely_minutes, p.visit_duration_max_minutes,
  p.crowd_pattern, p.hours_note_i18n, p.editorial_weight, p.published_at,
  entity_trust('places', p.id) as trust,
  accessibility_for(p.id, null) as accessibility,
  p.search_tsv,
  st_y(p.location::geometry) as latitude,
  st_x(p.location::geometry) as longitude
from places p
where p.status = 'published'
  and p.deleted_at is null
  and critical_fields_gated(
        'places', p.id,
        array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
      );

comment on view v_published_places is
  'Traveler-visible places. Carries latitude/longitude as plain numbers for maps and the '
  'Open-in-Maps hand-off (0021); `location` remains for anything wanting the geometry.';
