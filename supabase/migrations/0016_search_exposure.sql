-- 0016_search_exposure.sql — traveler text search over published knowledge (SRCH-01).
--
-- The `search_tsv` generated columns have existed since 0003 (TRD-DB-005) but were not on
-- the published views, so a traveler had nothing to search. This appends them.
--
-- Appended, never inserted, for the same reason as 0015: a client reading columns
-- positionally must not silently shift. Another view shape change, so another Dexie
-- version bump when the snapshot lands in B-023 (CLAUDE.md §4).
--
-- NOTE ON THE TEXT CONFIGURATION. The generated columns use `to_tsvector('simple', ...)`,
-- which does no stemming and no stop-word removal. That is deliberate and predates this
-- migration: the same column has to hold English, Telugu and Devanagari, and an English
-- stemmer applied to Telugu produces confident nonsense. The cost is that "temples" does
-- not match "temple", which is a real limitation — it is the reason B-032's hybrid
-- pgvector search exists in the roadmap. Every query against these columns must pass
-- `config => 'simple'` or it will silently use the server default and match differently
-- from the index.

create or replace view v_published_places as
select
  p.id, p.destination_id, p.slug, p.name_i18n, p.place_type, p.facility_subtype,
  p.location, p.address, p.summary_i18n,
  p.opening_schedule, p.closure_rules_i18n, p.entry_requirements_i18n, p.dress_code_i18n,
  p.visit_duration_min_minutes, p.visit_duration_likely_minutes, p.visit_duration_max_minutes,
  p.crowd_pattern, p.hours_note_i18n, p.editorial_weight, p.published_at,
  entity_trust('places', p.id) as trust,
  accessibility_for(p.id, null) as accessibility,
  p.search_tsv
from places p
where p.status = 'published'
  and p.deleted_at is null
  and critical_fields_gated(
        'places', p.id,
        array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']
      );

create or replace view v_published_experiences as
select
  e.id, e.destination_id, e.place_id, e.route_id, e.slug, e.name_i18n, e.experience_type,
  e.significance_i18n, e.description_i18n,
  e.duration_min_minutes, e.duration_likely_minutes, e.duration_max_minutes,
  e.advance_booking_required, e.advance_booking_how_i18n, e.advance_booking_opens_days_before,
  e.eligibility_i18n, e.cost_note_i18n, e.queue_expectation_i18n, e.preparation_i18n,
  e.is_outdoor, e.editorial_weight, e.published_at,
  entity_trust('experiences', e.id) as trust,
  (select p.accessibility from v_published_places p where p.id = e.place_id) as accessibility,
  e.search_tsv
from experiences e
where e.status = 'published'
  and e.deleted_at is null
  and critical_fields_gated(
        'experiences', e.id,
        array['advance_booking_required', 'advance_booking_how_i18n']
      );

create or replace view v_published_destinations as
select
  d.id, d.slug, d.name_i18n, d.region, d.state, d.country,
  d.centre, d.radius_km, d.overview_i18n, d.best_seasons_i18n, d.seasonal_notes_i18n,
  d.hero_media_id, d.editorial_weight, d.published_at,
  entity_trust('destinations', d.id) as trust,
  d.search_tsv
from destinations d
where d.status = 'published'
  and d.deleted_at is null;
