-- pgTAP: 0034 — extracted claims become review work and conflicts, never knowledge.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3500000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'editor@0035.test');
insert into user_roles (user_id, role) values ('f3500000-0000-4000-8000-0000000000d1', 'editor');

insert into sources (id, name, source_type, tier) values
  ('f3510000-0000-4000-8000-000000000001', 'Temple trust (verified)', 'official_authority', 'T1'),
  ('f3510000-0000-4000-8000-000000000002', 'District tourism office', 'government', 'T2'),
  ('f3510000-0000-4000-8000-000000000005', 'A travel forum', 'curated_research', 'T5');

insert into destinations (id, slug, name_i18n, centre, radius_km, status)
values ('f3520000-0000-4000-8000-000000000001', 'claims-town', '{"en":"Town"}'::jsonb,
        'SRID=4326;POINT(80.0 15.0)', 5, 'published');

insert into places (id, destination_id, slug, name_i18n, place_type, location,
                    closure_rules_i18n, dress_code_i18n)
values ('f3530000-0000-4000-8000-000000000001', 'f3520000-0000-4000-8000-000000000001', 'claims-shrine',
        '{"en":"Shrine"}'::jsonb, 'temple', 'SRID=4326;POINT(80.0 15.0)',
        '{"en":"Closed on Tuesdays"}'::jsonb, '{"en":"Traditional dress"}'::jsonb);

insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status, verified_at)
values ('places', 'f3530000-0000-4000-8000-000000000001', 'closure_rules_i18n',
        'f3510000-0000-4000-8000-000000000001', 'T1', 'verified', now() - interval '10 days');

insert into source_captures (id, source_id, content_hash) values
  ('f3540000-0000-4000-8000-000000000002', 'f3510000-0000-4000-8000-000000000002', 'hash-t2'),
  ('f3540000-0000-4000-8000-000000000005', 'f3510000-0000-4000-8000-000000000005', 'hash-t5');

-- ── Who may record ────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.record_extraction(uuid, text, text, jsonb)', 'execute'),
  'no signed-in user can record an extraction — only the ingestion runner');
select ok(
  not has_function_privilege('authenticated', 'public.open_conflict_internal(text, uuid, text, jsonb)', 'execute'),
  'nor open a conflict without the verifier check');

-- ── A T2 source disagrees with a verified T1 value ────────────────────────────

set local role service_role;

select is(
  record_extraction('f3540000-0000-4000-8000-000000000002', 'google', 'gemini-2.5-flash', $c$[
    {"entity_table": "places", "entity_id": "f3530000-0000-4000-8000-000000000001",
     "field_name": "closure_rules_i18n", "value": "Closed on Mondays",
     "excerpt": "The shrine is closed on Mondays.", "locale": "en", "confidence": "high"},
    {"entity_table": "places", "entity_id": "f3530000-0000-4000-8000-000000000001",
     "field_name": "dress_code_i18n", "value": "  traditional   DRESS ",
     "excerpt": "Traditional dress.", "locale": "en", "confidence": "high"},
    {"entity_table": "places", "entity_id": "f3530000-0000-4000-8000-000000000001",
     "field_name": "not_a_column", "value": "x", "excerpt": "x", "locale": "en", "confidence": "low"},
    {"entity_table": "places", "entity_id": "not-a-uuid",
     "field_name": "closure_rules_i18n", "value": "x", "excerpt": "x", "locale": "en", "confidence": "low"}
  ]$c$::jsonb) - 'extraction_id',
  '{"candidates": 1, "conflicts": 1, "skipped": 3}'::jsonb,
  'one real change, one agreement, one unknown field, one malformed id');

reset role;

select is(
  (select new_value ->> 'value' from change_candidates
    where entity_id = 'f3530000-0000-4000-8000-000000000001' and field_name = 'closure_rules_i18n'),
  'Closed on Mondays',
  'the Review queue receives the proposed value');
select is(
  (select new_value ->> 'origin' from change_candidates
    where entity_id = 'f3530000-0000-4000-8000-000000000001' and field_name = 'closure_rules_i18n'),
  'ai_extracted',
  'labelled as extracted, not as a fact');
select is(
  (select closure_rules_i18n ->> 'en' from places where id = 'f3530000-0000-4000-8000-000000000001'),
  'Closed on Tuesdays',
  'and the knowledge itself is untouched (CLAUDE.md §5)');

select is(
  (select jsonb_array_length(values) from conflicts
    where entity_id = 'f3530000-0000-4000-8000-000000000001' and status = 'open'),
  2, 'the disagreement opened a conflict holding both sides');
select is(
  (select values -> 0 ->> 'value' from conflicts
    where entity_id = 'f3530000-0000-4000-8000-000000000001' and status = 'open'),
  'Closed on Tuesdays', 'with the trusted source''s current value first');
select ok(
  (select conflict_flag from trust_records
    where entity_id = 'f3530000-0000-4000-8000-000000000001' and field_name = 'closure_rules_i18n'),
  'the field now reads as uncertain to travelers');
select isnt_empty(
  $$ select 1 from review_tasks
      where task_type = 'conflict' and entity_id = 'f3530000-0000-4000-8000-000000000001' $$,
  'and a verifier has it on their queue');
select isnt_empty(
  $$ select 1 from ai_extractions where capture_id = 'f3540000-0000-4000-8000-000000000002' $$,
  'every claim the model made is kept, verbatim');

-- ── A T5 source is review work, never a conflict ──────────────────────────────

insert into places (id, destination_id, slug, name_i18n, place_type, location, entry_requirements_i18n)
values ('f3530000-0000-4000-8000-000000000002', 'f3520000-0000-4000-8000-000000000001', 'claims-ghat',
        '{"en":"Ghat"}'::jsonb, 'ghat', 'SRID=4326;POINT(80.0 15.0)', '{"en":"No requirements"}'::jsonb);
insert into trust_records (entity_table, entity_id, field_name, source_id, source_tier, verification_status)
values ('places', 'f3530000-0000-4000-8000-000000000002', 'entry_requirements_i18n',
        'f3510000-0000-4000-8000-000000000001', 'T1', 'verified');

set local role service_role;
select is(
  (record_extraction('f3540000-0000-4000-8000-000000000005', 'google', 'gemini-2.5-flash', $c$[
    {"entity_table": "places", "entity_id": "f3530000-0000-4000-8000-000000000002",
     "field_name": "entry_requirements_i18n", "value": "Tickets required",
     "excerpt": "Tickets required.", "locale": "en", "confidence": "low"}
  ]$c$::jsonb) ->> 'conflicts')::int,
  0, 'a low-tier source cannot flag a verified field as disputed');
reset role;

select isnt_empty(
  $$ select 1 from change_candidates
      where entity_id = 'f3530000-0000-4000-8000-000000000002' and status = 'open' $$,
  'but its claim still reaches a reviewer');

select * from finish();
rollback;
