-- pgTAP: TRD §4.2/§4.3 table structure, RLS posture and locale seed (TRD-DB-001/004).

begin;
select plan(21);

-- ── Tables exist ──────────────────────────────────────────────────────────────
select has_table('public', 'locales', 'locales exists');
select has_table('public', 'ui_strings', 'ui_strings exists');
select has_table('public', 'sources', 'sources exists');
select has_table('public', 'trust_records', 'trust_records exists');
select has_table('public', 'ingestion_jobs', 'ingestion_jobs exists');
select has_table('public', 'source_captures', 'source_captures exists');
select has_table('public', 'ai_extractions', 'ai_extractions exists');
select has_table('public', 'change_candidates', 'change_candidates exists');
select has_table('public', 'conflicts', 'conflicts exists');
select has_table('public', 'entity_versions', 'entity_versions exists');
select has_table('public', 'audit_log', 'audit_log exists');
select has_table('public', 'review_tasks', 'review_tasks exists');

-- ── Deny-by-default posture (CLAUDE.md §4: authorization enforced in RLS) ──────
-- Policies arrive in B-006; what matters now is that no table is left unprotected.
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

-- ── Shared plumbing ───────────────────────────────────────────────────────────
select has_function('public', 'set_updated_at', 'set_updated_at() exists');
select has_function('public', 'record_entity_version', 'record_entity_version() exists');
select has_function('public', 'derive_freshness', 'derive_freshness() exists');
select has_function('public', 'derive_confidence', 'derive_confidence() exists');

-- Every table carrying updated_at must have the trigger, or the column silently lies.
select is_empty(
  $$ select c.table_name
       from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'updated_at'
        and not exists (
          select 1 from pg_trigger tg
          join pg_class cl on cl.oid = tg.tgrelid
          join pg_namespace n on n.oid = cl.relnamespace
          where n.nspname = 'public'
            and cl.relname = c.table_name
            and not tg.tgisinternal
            and tg.tgname = c.table_name || '_set_updated_at'
        ) $$,
  'every table with updated_at has its set_updated_at trigger'
);

-- ── Trust record uniqueness, including the whole-entity (NULL field) case ─────
select has_column('public', 'trust_records', 'field_name', 'trust_records.field_name exists');

insert into trust_records (entity_table, entity_id, field_name)
values ('places', '11111111-1111-1111-1111-111111111111', null);

select throws_ok(
  $$ insert into trust_records (entity_table, entity_id, field_name)
     values ('places', '11111111-1111-1111-1111-111111111111', null) $$,
  '23505',
  null,
  'whole-entity trust (field_name NULL) cannot be duplicated'
);

-- ── Launch locales seeded (D-014) ─────────────────────────────────────────────
select bag_eq(
  $$ select code from locales where is_active $$,
  $$ values ('en'), ('te'), ('hi') $$,
  'locales seeded with the launch set en/te/hi'
);

select * from finish();
rollback;
