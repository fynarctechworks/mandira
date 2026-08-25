-- pgTAP: TRD §4.3 freshness/confidence derivation truth table.
--
-- These two rules decide which trust badge a traveler sees (PRD F9), so they are worth
-- pinning precisely. Confidence must never be inflated: a conflict or a report-driven
-- downgrade caps it at low no matter how good the source is.

begin;
select plan(16);

-- ── freshness: <=90d fresh, <=180d aging, else stale ──────────────────────────
select is(derive_freshness(now() - interval '1 day', null), 'fresh', 'verified today -> fresh');
select is(derive_freshness(now() - interval '89 days', null), 'fresh', '89 days -> fresh');
select is(derive_freshness(now() - interval '91 days', null), 'aging', '91 days -> aging');
select is(derive_freshness(now() - interval '179 days', null), 'aging', '179 days -> aging');
select is(derive_freshness(now() - interval '181 days', null), 'stale', '181 days -> stale');
select is(derive_freshness(null, null), 'stale', 'never verified -> stale, not fresh');

-- An expired validity window overrides recency: the fact is known to have lapsed.
select is(
  derive_freshness(now() - interval '1 day', current_date - 1),
  'stale',
  'expired valid_until forces stale even when just verified'
);
select is(
  derive_freshness(now() - interval '1 day', current_date + 30),
  'fresh',
  'future valid_until leaves freshness on recency'
);

-- ── confidence ────────────────────────────────────────────────────────────────
select is(derive_confidence('T1', 'verified', 'fresh', false, false), 'high', 'T1+verified+fresh -> high');
select is(derive_confidence('T2', 'verified', 'fresh', false, false), 'high', 'T2+verified+fresh -> high');
select is(derive_confidence('T3', 'verified', 'fresh', false, false), 'medium', 'T3+verified+fresh -> medium');
select is(derive_confidence('T1', 'verified', 'aging', false, false), 'medium', 'verified+aging -> medium');
select is(derive_confidence('T1', 'verified', 'stale', false, false), 'low', 'verified+stale -> low');
select is(
  derive_confidence('T1', 'human_reviewed', 'fresh', false, false),
  'low',
  'not yet verified -> low regardless of tier'
);

-- PRD F9: conflict or report downgrade must surface as "Check locally".
select is(
  derive_confidence('T1', 'verified', 'fresh', true, false),
  'low',
  'conflict_flag caps confidence at low'
);
select is(
  derive_confidence('T1', 'verified', 'fresh', false, true),
  'low',
  'report_downgrade caps confidence at low'
);

select * from finish();
rollback;
