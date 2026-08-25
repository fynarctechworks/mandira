-- pgTAP: shared trigger plumbing — updated_at stamping, trust derivation on write,
-- and the reusable entity-version recorder that B-004 attaches to knowledge tables.

begin;
select plan(9);

-- ── updated_at advances on UPDATE ─────────────────────────────────────────────
insert into sources (id, name, source_type, tier)
values ('22222222-2222-2222-2222-222222222222', 'Temple administration', 'official_authority', 'T1');

-- Force a measurable gap: now() is transaction-stable, so compare against the stored value.
update sources
   set updated_at = now() - interval '1 hour'
 where id = '22222222-2222-2222-2222-222222222222';

update sources set notes = 'first note' where id = '22222222-2222-2222-2222-222222222222';

select ok(
  (select updated_at > now() - interval '1 minute' from sources
    where id = '22222222-2222-2222-2222-222222222222'),
  'set_updated_at refreshes updated_at on UPDATE'
);

-- ── trust derivation happens on write, not just on read ───────────────────────
insert into trust_records (entity_table, entity_id, field_name, source_tier, verification_status, verified_at)
values ('places', '33333333-3333-3333-3333-333333333333', 'opening_schedule', 'T1', 'verified', now());

select is(
  (select freshness from trust_records where entity_id = '33333333-3333-3333-3333-333333333333'),
  'fresh',
  'freshness derived on INSERT'
);
select is(
  (select confidence from trust_records where entity_id = '33333333-3333-3333-3333-333333333333'),
  'high',
  'confidence derived on INSERT'
);

-- Raising the conflict flag must immediately drop confidence — no stale derived value.
update trust_records
   set conflict_flag = true
 where entity_id = '33333333-3333-3333-3333-333333333333';

select is(
  (select confidence from trust_records where entity_id = '33333333-3333-3333-3333-333333333333'),
  'low',
  'confidence re-derived on UPDATE when conflict_flag is set'
);

-- ── record_entity_version() behaviour, exercised on a throwaway table ─────────
create table version_probe (
  id         uuid primary key default gen_random_uuid(),
  title      text,
  updated_at timestamptz not null default now()
);

create trigger version_probe_record_version
  after insert or update on version_probe
  for each row execute function record_entity_version();

insert into version_probe (id, title) values ('44444444-4444-4444-4444-444444444444', 'first');

select is(
  (select version from entity_versions
    where entity_table = 'version_probe' and entity_id = '44444444-4444-4444-4444-444444444444'),
  1,
  'first write records version 1'
);
select is(
  (select changed_fields from entity_versions
    where entity_table = 'version_probe' and entity_id = '44444444-4444-4444-4444-444444444444'),
  '{}'::text[],
  'INSERT records no changed_fields (the whole row is new)'
);

update version_probe set title = 'second' where id = '44444444-4444-4444-4444-444444444444';

select is(
  (select max(version) from entity_versions
    where entity_table = 'version_probe' and entity_id = '44444444-4444-4444-4444-444444444444'),
  2,
  'second write records version 2'
);
select is(
  (select changed_fields from entity_versions
    where entity_table = 'version_probe'
      and entity_id = '44444444-4444-4444-4444-444444444444' and version = 2),
  array['title'],
  'UPDATE records only the genuinely changed column'
);

-- updated_at churn must not masquerade as a content change.
update version_probe set updated_at = now() where id = '44444444-4444-4444-4444-444444444444';

select is(
  (select changed_fields from entity_versions
    where entity_table = 'version_probe'
      and entity_id = '44444444-4444-4444-4444-444444444444' and version = 3),
  '{}'::text[],
  'updated_at alone is not reported as a changed field'
);

select * from finish();
rollback;
