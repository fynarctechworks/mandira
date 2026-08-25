-- 0010_geo_accessors.sql — expose PostGIS coordinates to PostgREST (TRD-DB-005).
--
-- PostgREST serialises a `geography` column as EWKB hex ("0101000020E6100000…"), not as
-- GeoJSON. Application code that expects coordinates therefore reads nothing useful, and
-- does so SILENTLY — a saved pin simply comes back blank, which is how this was found
-- (the B-009 editor round-trip test).
--
-- These are PostgREST computed columns: a function taking the table's row type appears as
-- a selectable column, so `select("*, latitude, longitude")` returns real numbers without
-- any client-side hex parsing.
--
-- Writes still use WKT (`SRID=4326;POINT(lon lat)`), which Postgres casts natively.

create or replace function public.latitude(destinations)
returns double precision
language sql
stable
parallel safe
as $$ select st_y($1.centre::geometry) $$;

create or replace function public.longitude(destinations)
returns double precision
language sql
stable
parallel safe
as $$ select st_x($1.centre::geometry) $$;

comment on function public.latitude(destinations) is
  'PostgREST computed column: destination centre latitude in WGS84.';

create or replace function public.latitude(places)
returns double precision
language sql
stable
parallel safe
as $$ select st_y($1.location::geometry) $$;

create or replace function public.longitude(places)
returns double precision
language sql
stable
parallel safe
as $$ select st_x($1.location::geometry) $$;

comment on function public.latitude(places) is
  'PostgREST computed column: place location latitude in WGS84.';

-- Computed columns are executed as the requesting role, so they need the same grant the
-- table's other columns rely on. RLS on the underlying table still applies.
grant execute on function public.latitude(destinations) to anon, authenticated;
grant execute on function public.longitude(destinations) to anon, authenticated;
grant execute on function public.latitude(places) to anon, authenticated;
grant execute on function public.longitude(places) to anon, authenticated;
