-- A destination big enough to measure PRD-PLAN-009 against.
--
-- The requirement is "3-day / 12-item journey built + retiered ≤ 5 min", and the fixture
-- destination holds three experiences — so a twelve-item journey could not be built at all,
-- and the number nobody had measured could not have been measured. Sixteen experiences here
-- leave room for twelve plus the two the brief places itself.
--
-- Everything is invented and says so in its own name, as in 0002. Seeds are local only
-- (`supabase db reset`), and this one exists for `pnpm perf`.
--
-- Published, because the traveler app reads `v_published_*` and nothing else: an experience
-- that fails the publish gate is invisible to the builder, so the trust records below are
-- what make this destination measurable at all rather than decoration.

do $$
declare
  v_dest     uuid := 'd0000000-0000-4000-8000-00000000e001';
  v_place    uuid := 'd0000000-0000-4000-8000-00000000e002';
  v_src      uuid := 'd0000000-0000-4000-8000-00000000e0a1';
  v_ids      uuid[];
  v_id       uuid;
  n          int;
begin
  insert into sources (id, name, source_type, tier, url) values
    (v_src, 'Perf Fixture Authority (not real)', 'official_authority', 'T1',
     'https://example.invalid/perf-authority')
  on conflict (id) do nothing;

  insert into destinations (id, slug, name_i18n, region, state, country, centre, radius_km,
                            overview_i18n, best_seasons_i18n, status, published_at)
  values (
    v_dest, 'perf-largetown',
    '{"en":"Largetown (perf fixture)"}'::jsonb,
    'Fixture Region', 'Fixture State', 'IN',
    'SRID=4326;POINT(78.4900 17.3900)', 15,
    '{"en":"An invented destination with enough experiences to build a twelve-item journey. None of this is real."}'::jsonb,
    '{"en":"Invented."}'::jsonb,
    'published', now()
  )
  on conflict (id) do nothing;

  insert into places (id, destination_id, slug, name_i18n, place_type, location, address,
                      summary_i18n, opening_schedule, closure_rules_i18n,
                      entry_requirements_i18n, dress_code_i18n,
                      visit_duration_min_minutes, visit_duration_likely_minutes,
                      visit_duration_max_minutes, status, published_at)
  values (
    v_place, v_dest, 'perf-main-temple',
    '{"en":"Main Temple (perf fixture)"}'::jsonb, 'temple',
    'SRID=4326;POINT(78.4900 17.3900)', 'Invented address',
    '{"en":"Invented."}'::jsonb,
    '{"weekly":{"mon":[["05:00","21:00"]],"tue":[["05:00","21:00"]],"wed":[["05:00","21:00"]],"thu":[["05:00","21:00"]],"fri":[["05:00","21:00"]],"sat":[["05:00","21:00"]],"sun":[["05:00","21:00"]]}}'::jsonb,
    '{"en":"Invented: none."}'::jsonb,
    '{"en":"Invented: none."}'::jsonb,
    '{"en":"Invented: modest dress."}'::jsonb,
    20, 40, 80, 'published', now()
  )
  on conflict (id) do nothing;

  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'places', v_place, f, v_src, 'T1', 'verified', now() - interval '10 days'
  from unnest(array['opening_schedule', 'closure_rules_i18n', 'entry_requirements_i18n']) f
  on conflict do nothing;

  /*
   * Sixteen experiences, each an hour and open all day.
   *
   * Deliberately uniform: this destination measures how long the BUILDER takes, and
   * interesting availability would make the number a story about the scheduler instead.
   * The fixture destination in 0002 is where awkward shapes live.
   */
  for n in 1..16 loop
    v_id := ('d0000000-0000-4000-8000-00000000e1' || lpad(n::text, 2, '0'))::uuid;
    v_ids := v_ids || v_id;

    insert into experiences (id, destination_id, place_id, slug, name_i18n, experience_type,
                             significance_i18n, description_i18n,
                             duration_min_minutes, duration_likely_minutes, duration_max_minutes,
                             advance_booking_required, advance_booking_how_i18n,
                             advance_booking_opens_days_before, queue_expectation_i18n,
                             is_outdoor, editorial_weight, status, published_at)
    values (
      v_id, v_dest, v_place, 'perf-experience-' || lpad(n::text, 2, '0'),
      jsonb_build_object('en', 'Perf experience ' || n || ' (fixture)'), 'darshan',
      '{"en":"Invented significance."}'::jsonb,
      '{"en":"Invented. Exists so a twelve-item journey can be built and measured."}'::jsonb,
      30, 60, 90,
      false, '{}'::jsonb, null, '{"en":"Invented: short queue."}'::jsonb,
      false, 3, 'published', now()
    )
    on conflict (id) do nothing;
  end loop;

  -- The publish gate needs every critical field verified, or none of this is visible.
  insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier,
                             verification_status, verified_at)
  select 'experiences', e, f, v_src, 'T1', 'verified', now() - interval '10 days'
  from unnest(v_ids) e,
       unnest(array['advance_booking_required', 'advance_booking_how_i18n']) f
  on conflict do nothing;

  raise notice 'Seeded the perf destination: 16 published experiences for pnpm perf.';
end;
$$;
