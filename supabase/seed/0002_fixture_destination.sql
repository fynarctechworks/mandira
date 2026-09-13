-- 0002_fixture_destination.sql — a local development fixture. NOT CONTENT.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- READ THIS BEFORE USING ANY OF IT.
--
-- Everything below is INVENTED. "Devagiri" is not a real place, its timings are not
-- real timings, and none of it has ever been checked against a source. It exists so the
-- traveler app has something to render, the publish gate has something to gate, and E2E
-- tests have something stable to assert against — before B-013 seeds the real destination
-- that OPEN-001 is waiting on.
--
-- Every slug is prefixed `fixture-` and every name says so on its face, so nothing here
-- can be mistaken for launch content in a database, a screenshot, or a bug report.
--
-- Seeds run only on `supabase db reset`, which is a local-only command. The guard below is
-- a second lock on that door, not the first.
-- ══════════════════════════════════════════════════════════════════════════════

do $seed$
declare
  v_dest        uuid := 'd0000000-0000-4000-8000-00000000f001';
  v_temple      uuid := 'd0000000-0000-4000-8000-00000000f002';
  v_hall        uuid := 'd0000000-0000-4000-8000-00000000f003';
  v_gate        uuid := 'd0000000-0000-4000-8000-00000000f004';
  v_unready     uuid := 'd0000000-0000-4000-8000-00000000f005';
  v_route       uuid := 'd0000000-0000-4000-8000-00000000f006';
  v_dawn        uuid := 'd0000000-0000-4000-8000-00000000f007';
  v_general     uuid := 'd0000000-0000-4000-8000-00000000f008';
  v_evening     uuid := 'd0000000-0000-4000-8000-00000000f009';
  v_src_auth    uuid := 'd0000000-0000-4000-8000-00000000f0a1';
  v_src_guide   uuid := 'd0000000-0000-4000-8000-00000000f0a2';
begin
  -- A fixture that has already been loaded is left alone: `db reset` reruns seeds, and a
  -- second insert would fail on the slug unique constraints and abort the whole reset.
  if exists (select 1 from destinations where id = v_dest) then
    raise notice 'Fixture destination already present; skipping.';
    return;
  end if;

  -- ── Sources, at two different tiers ───────────────────────────────────────
  -- Two tiers on purpose: confidence is derived from tier + verification + freshness
  -- (0002), so one source is not enough to produce more than one badge state.
  insert into sources (id, name, source_type, tier, url) values
    (v_src_auth,  'Fixture Temple Authority (not real)', 'official_authority', 'T1',
     'https://example.invalid/fixture-authority'),
    (v_src_guide, 'Fixture Local Guide (not real)',      'curated_research',   'T3',
     'https://example.invalid/fixture-guide');

  -- ── Destination ───────────────────────────────────────────────────────────
  insert into destinations (id, slug, name_i18n, region, state, country, centre, radius_km,
                            overview_i18n, best_seasons_i18n, status, published_at)
  values (
    v_dest, 'fixture-devagiri',
    '{"en":"Devagiri (fixture)","te":"దేవగిరి (fixture)","hi":"देवगिरि (fixture)"}'::jsonb,
    'Fixture Region', 'Fixture State', 'IN',
    'SRID=4326;POINT(78.4772 17.3850)', 12,
    '{"en":"An invented hill destination used for local development. None of this is real."}'::jsonb,
    '{"en":"Invented. Do not plan anything around it."}'::jsonb,
    'published', now()
  );

  -- ── Places ────────────────────────────────────────────────────────────────
  insert into places (id, destination_id, slug, name_i18n, place_type, location, address,
                      summary_i18n, opening_schedule, closure_rules_i18n,
                      entry_requirements_i18n, dress_code_i18n,
                      visit_duration_min_minutes, visit_duration_likely_minutes,
                      visit_duration_max_minutes, status, published_at)
  values
    (v_temple, v_dest, 'fixture-hill-temple',
     '{"en":"Hill Temple (fixture)","te":"కొండ ఆలయం (fixture)"}'::jsonb, 'temple',
     'SRID=4326;POINT(78.4780 17.3860)', 'Fixture Hill Road, Devagiri',
     '{"en":"The main temple of the invented destination."}'::jsonb,
     '{"weekly":{"mon":[["05:00","21:00"]],"tue":[["05:00","21:00"]],"wed":[["05:00","21:00"]],
                 "thu":[["05:00","21:00"]],"fri":[["05:00","21:00"]],"sat":[["04:30","22:00"]],
                 "sun":[["04:30","22:00"]]}}'::jsonb,
     '{"en":"Closed to visitors during the invented monsoon festival."}'::jsonb,
     '{"en":"Carry photo ID for every traveler."}'::jsonb,
     '{"en":"Traditional dress. No footwear inside."}'::jsonb,
     45, 90, 180, 'published', now()),

    (v_hall, v_dest, 'fixture-prasadam-hall',
     '{"en":"Prasadam Hall (fixture)"}'::jsonb, 'facility',
     'SRID=4326;POINT(78.4790 17.3855)', 'Beside the Hill Temple',
     '{"en":"Where the invented meal is served."}'::jsonb,
     '{"weekly":{"mon":[["11:00","14:00"]],"tue":[["11:00","14:00"]],"wed":[["11:00","14:00"]],
                 "thu":[["11:00","14:00"]],"fri":[["11:00","14:00"]],"sat":[["11:00","14:30"]],
                 "sun":[["11:00","14:30"]]}}'::jsonb,
     '{"en":"Closed on the invented festival day."}'::jsonb,
     '{"en":"No requirements."}'::jsonb, '{"en":"No specific dress code."}'::jsonb,
     20, 40, 60, 'published', now()),

    (v_gate, v_dest, 'fixture-east-gate',
     '{"en":"East Gate (fixture)"}'::jsonb, 'facility',
     'SRID=4326;POINT(78.4770 17.3848)', 'East approach',
     '{"en":"The step-free approach to the temple."}'::jsonb,
     null, '{}'::jsonb, '{"en":"None."}'::jsonb, '{}'::jsonb,
     5, 10, 20, 'published', now()),

    -- Published, but its critical fields are NOT all reviewed. It must stay invisible to
    -- travelers, and it is here precisely so a test can prove the gate is doing something.
    (v_unready, v_dest, 'fixture-unready-shrine',
     '{"en":"Unready Shrine (fixture)"}'::jsonb, 'temple',
     'SRID=4326;POINT(78.4760 17.3840)', 'Fixture path',
     '{"en":"Published but not fully reviewed. A traveler must never see this."}'::jsonb,
     null, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
     15, 30, 45, 'published', now());

  insert into accessibility_records (place_id, step_free, wheelchair_access, queue_assistance,
                                     rest_seating, distance_from_dropoff_m, notes_i18n)
  values
    (v_temple, 'partial', 'partial', true, true, 350,
     '{"en":"Invented: a ramp on the east side, steps elsewhere."}'::jsonb),
    (v_gate, 'yes', 'yes', false, true, 40,
     '{"en":"Invented: level throughout."}'::jsonb);
  -- The Prasadam Hall deliberately has NO accessibility record, so the UI has a case where
  -- the honest answer is "we do not know" rather than "it has none of these" (D-080).

  -- ── A route with stops ────────────────────────────────────────────────────
  insert into routes (id, destination_id, slug, name_i18n, mode, distance_m,
                      duration_min_minutes, duration_likely_minutes, duration_max_minutes,
                      difficulty, elevation_note_i18n, status, published_at)
  values (v_route, v_dest, 'fixture-east-approach',
          '{"en":"East Approach Walk (fixture)"}'::jsonb, 'walk', 900,
          15, 25, 40, 'easy',
          '{"en":"Invented: gentle throughout."}'::jsonb, 'published', now());

  insert into route_places (route_id, place_id, sort_order, is_rest_point) values
    (v_route, v_gate, 0, false),
    (v_route, v_temple, 1, false),
    (v_route, v_hall, 2, true);

  -- ── Experiences ───────────────────────────────────────────────────────────
  insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type,
                           significance_i18n, description_i18n,
                           duration_min_minutes, duration_likely_minutes, duration_max_minutes,
                           advance_booking_required, advance_booking_how_i18n,
                           advance_booking_opens_days_before, queue_expectation_i18n,
                           is_outdoor, editorial_weight, status, published_at)
  values
    (v_dawn, v_dest, v_temple, 'fixture-dawn-darshan',
     '{"en":"Dawn Darshan (fixture)","te":"ఉదయ దర్శనం (fixture)"}'::jsonb, 'darshan',
     '{"en":"Invented significance."}'::jsonb,
     '{"en":"An invented early-morning darshan, used to exercise a narrow availability window."}'::jsonb,
     60, 90, 150,
     true, '{"en":"Invented: book through the fixture portal."}'::jsonb, 60,
     '{"en":"Invented: expect a long queue."}'::jsonb,
     false, 5, 'published', now()),

    (v_general, v_dest, v_temple, 'fixture-general-darshan',
     '{"en":"General Darshan (fixture)"}'::jsonb, 'darshan',
     '{"en":"Invented significance."}'::jsonb,
     '{"en":"Available through the day, so the engine has something flexible to place."}'::jsonb,
     30, 60, 120,
     false, '{}'::jsonb, null, '{"en":"Invented: moderate queue."}'::jsonb,
     false, 3, 'published', now()),

    (v_evening, v_dest, v_temple, 'fixture-evening-aarti',
     '{"en":"Evening Aarti (fixture)"}'::jsonb, 'ritual',
     '{"en":"Invented significance."}'::jsonb,
     '{"en":"A fixed evening ritual, so a journey has something that cannot move."}'::jsonb,
     45, 60, 75,
     false, '{}'::jsonb, null, '{"en":"Invented: arrive early."}'::jsonb,
     true, 5, 'published', now());

  -- ── Availability ──────────────────────────────────────────────────────────
  insert into availability_rules (experience_id, kind, daily_times, priority) values
    (v_dawn,    'daily_fixed_times', '[{"start":"05:00","end":"08:00"}]'::jsonb, 1),
    (v_evening, 'daily_fixed_times', '[{"start":"18:30","end":"19:30"}]'::jsonb, 1);

  insert into availability_rules (experience_id, kind, priority) values
    (v_general, 'always_during_opening', 1);

  -- ── Transport and cached travel ───────────────────────────────────────────
  insert into transport_connections (destination_id, from_place_id, to_place_id, mode,
                                     duration_likely_minutes, duration_max_minutes,
                                     frequency_note_i18n, status, published_at)
  values (v_dest, v_gate, v_temple, 'walk', 12, 20,
          '{"en":"Invented: walk whenever you like."}'::jsonb, 'published', now());

  -- Cached legs so the engine can schedule without a routing provider (TRD §5.5 fallback).
  insert into travel_estimates (from_place_id, to_place_id, mode, distance_m, duration_seconds)
  values
    (v_gate,   v_temple, 'walk', 700, 720),
    (v_temple, v_hall,   'walk', 220, 240),
    (v_hall,   v_temple, 'walk', 220, 240);

  -- ── Guidance, phrases, advisory ───────────────────────────────────────────
  insert into guidance_blocks (guidance_type, body_i18n, applies_to_table, applies_to_id,
                               sort_order, status, published_at)
  values
    ('etiquette', '{"en":"Invented: remove footwear before the inner courtyard."}'::jsonb,
     'places', v_temple, 0, 'published', now()),
    ('accessibility', '{"en":"Invented: the east gate is the step-free approach."}'::jsonb,
     'places', v_temple, 1, 'published', now()),
    ('timing_tip', '{"en":"Invented: the dawn queue forms about an hour ahead."}'::jsonb,
     'experiences', v_dawn, 0, 'published', now());

  insert into phrases (destination_id, context_tag, source_locale, source_text, translations,
                       sort_order, status, published_at)
  values
    (v_dest, 'directions', 'en', 'Where is the east gate?',
     '{"te":{"text":"తూర్పు ద్వారం ఎక్కడ ఉంది?","transliteration":"turpu dvaram ekkada undi?"}}'::jsonb,
     0, 'published', now()),
    (v_dest, 'help', 'en', 'We need to sit down for a while.',
     '{"te":{"text":"మేము కొంతసేపు కూర్చోవాలి.","transliteration":"memu kontasepu kurchovali."}}'::jsonb,
     1, 'published', now());

  insert into advisories (destination_id, title_i18n, body_i18n, severity, starts_at, ends_at,
                          source_id, status, published_at)
  values (v_dest, '{"en":"Invented resurfacing work"}'::jsonb,
          '{"en":"Invented: the east approach is being resurfaced. None of this is real."}'::jsonb,
          'caution', now() - interval '1 day', now() + interval '30 days',
          v_src_auth, 'published', now());

  -- ══════════════════════════════════════════════════════════════════════════
  -- Trust records — the point of the whole fixture.
  --
  -- Spread across tiers, verification statuses and ages so that every badge state PRD F9
  -- defines has something to render: high confidence, medium, and low. A fixture where
  -- everything is Verified would let a UI ship that has never drawn the other two.
  -- ══════════════════════════════════════════════════════════════════════════

  -- Hill Temple: fully reviewed and recently verified by a T1 source → high confidence.
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at, evidence_url)
  select 'places', v_temple, f, v_src_auth, 'T1', 'verified', now() - interval '10 days',
         'https://example.invalid/fixture-authority'
  from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

  -- Prasadam Hall: verified but ageing, by a T3 source → medium ("Verified earlier").
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'places', v_hall, f, v_src_guide, 'T3', 'verified', now() - interval '120 days'
  from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

  -- East Gate: reviewed but never verified, and stale → low ("Check locally").
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'places', v_gate, f, v_src_guide, 'T3', 'human_reviewed', now() - interval '300 days'
  from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f;

  -- Unready Shrine: only ONE of three critical fields reviewed, so the gate holds it back.
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  values ('places', v_unready, 'opening_schedule', v_src_guide, 'T3', 'verified', now());

  -- Experiences: the dawn darshan carries a conflict flag, so the UI has a conflicted
  -- field to render and the health check has trust exposure to report.
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at, conflict_flag)
  select 'experiences', v_dawn, f, v_src_auth, 'T1', 'verified', now() - interval '5 days',
         f = 'advance_booking_how_i18n'
  from unnest(array['advance_booking_required', 'advance_booking_how_i18n']) f;

  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'experiences', e, f, v_src_auth, 'T1', 'verified', now() - interval '20 days'
  from unnest(array[v_general, v_evening]) e,
       unnest(array['advance_booking_required', 'advance_booking_how_i18n']) f;

  -- Availability rules are critical in their entirety, so their trust has a NULL field.
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'availability_rules', a.id, null, v_src_auth, 'T1', 'verified', now() - interval '10 days'
  from availability_rules a
  where a.experience_id in (v_dawn, v_general, v_evening);

  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'transport_connections', t.id, 'duration_likely_minutes', v_src_guide, 'T3',
         'verified', now() - interval '30 days'
  from transport_connections t
  where t.destination_id = v_dest;

  raise notice 'Fixture destination "Devagiri (fixture)" seeded. None of it is real.';
end;
$seed$;
