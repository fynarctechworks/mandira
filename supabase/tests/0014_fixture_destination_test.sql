-- pgTAP: the local fixture destination holds the shapes it exists to provide.
--
-- The fixture is test infrastructure, so it needs tests of its own — not for what it says,
-- which is invented, but for the RANGE it covers. Its whole value is that a UI built
-- against it has to handle every badge state and every accessibility case. A well-meaning
-- edit that marks everything Verified would let a "Check locally" badge ship having never
-- been rendered, and nothing else in the suite would notice.

begin;
select plan(16);

-- ── It is there, and it is obviously not real ───────────────────────────────
select isnt_empty(
  $$ select 1 from destinations where slug = 'fixture-devagiri' $$,
  'the fixture destination is seeded'
);

select is(
  (select name_i18n ->> 'en' from destinations where slug = 'fixture-devagiri'),
  'Devagiri (fixture)',
  'the fixture destination says so in its own name, not only in its slug'
);

select is_empty(
  $$ select name_i18n ->> 'en' from places
      where destination_id = (select id from destinations where slug = 'fixture-devagiri')
        and name_i18n ->> 'en' not like '%(fixture)%' $$,
  'and every place says so in its name, so a screenshot cannot mislead'
);

-- ── All three confidence states, or the trust UI ships untested ─────────────
select is(
  (select confidence::text from trust_records t
   join places p on p.id = t.entity_id
   where p.slug = 'fixture-hill-temple' and t.field_name = 'opening_schedule'),
  'high',
  'a T1 source verified recently gives high confidence — the Verified badge'
);

select is(
  (select confidence::text from trust_records t
   join places p on p.id = t.entity_id
   where p.slug = 'fixture-prasadam-hall' and t.field_name = 'opening_schedule'),
  'medium',
  'a T3 source verified months ago gives medium — the "Verified earlier" badge'
);

select is(
  (select confidence::text from trust_records t
   join places p on p.id = t.entity_id
   where p.slug = 'fixture-east-gate' and t.field_name = 'opening_schedule'),
  'low',
  'reviewed but never verified, and stale, gives low — the "Check locally" badge'
);

select isnt_empty(
  $$ select 1 from trust_records where conflict_flag $$,
  'and something carries a conflict, so the conflict note has a case to render'
);

-- ── The gate is genuinely exercised, not merely present ─────────────────────
select is_empty(
  $$ select 1 from v_published_places where slug = 'fixture-unready-shrine' $$,
  'the published-but-unreviewed shrine is invisible to travelers'
);

select isnt_empty(
  $$ select 1 from places where slug = 'fixture-unready-shrine' and status = 'published' $$,
  'even though its status says published — which is what makes it a real test of the gate'
);

-- Scoped to the fixture destination: seed 0004 publishes a place of its own elsewhere, for
-- `pnpm perf`, and this assertion is about THESE four — one of which must fail the gate.
select is(
  (select count(*)::int from v_published_places
    where destination_id = 'd0000000-0000-4000-8000-00000000f001'), 3,
  'three of the four fixture places clear the gate'
);

-- ── All three accessibility cases ───────────────────────────────────────────
select is(
  (select accessibility ->> 'step_free' from v_published_places
   where slug = 'fixture-east-gate'),
  'yes',
  'one place is step-free'
);

select is(
  (select accessibility ->> 'step_free' from v_published_places
   where slug = 'fixture-hill-temple'),
  'partial',
  'one is partial, which is its own answer and not a rounded yes or no'
);

select is(
  (select accessibility from v_published_places where slug = 'fixture-prasadam-hall'),
  null,
  'and one has nothing recorded, so "we do not know" has a case to render (D-080)'
);

-- ── Enough shape for the engine to actually schedule against ────────────────
select isnt_empty(
  $$ select 1 from availability_rules a
     join experiences e on e.id = a.experience_id
     where e.slug = 'fixture-dawn-darshan' and a.kind = 'daily_fixed_times' $$,
  'a narrow fixed-time window exists, so scheduling has something hard to place'
);

select isnt_empty(
  $$ select 1 from availability_rules a
     join experiences e on e.id = a.experience_id
     where e.slug = 'fixture-general-darshan' and a.kind = 'always_during_opening' $$,
  'and something flexible, so it has room to move as well'
);

select isnt_empty(
  $$ select 1 from travel_estimates $$,
  'cached travel legs exist, so the engine can schedule with no routing provider (TRD §5.5)'
);

select * from finish();
rollback;
