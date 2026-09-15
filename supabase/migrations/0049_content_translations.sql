-- 0049_content_translations.sql — PRD F19 / PRD-OPS-CNT-004: translating an entity side by side.
--
-- Content text lives in the entity's `_i18n` jsonb columns (TRD §2), where the traveler app
-- already reads it, and it stays there. What those columns cannot say is whether a Telugu
-- value was confirmed by a translator, is still a draft, or was written against English that
-- has since changed. That is this table.

create table content_translations (
  entity_table text not null check (entity_table in ('destinations', 'places', 'experiences')),
  entity_id    uuid not null,
  field_name   text not null,
  locale       text not null references locales (code) on update cascade,
  status       text not null check (status in ('ai_draft', 'draft', 'confirmed')),
  source_text  text not null,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (entity_table, entity_id, field_name, locale),
  -- English is the source every translation is made from, never a translation itself.
  constraint content_translations_not_source check (locale <> 'en')
);

comment on table content_translations is
  'Status of each non-English value of a translatable _i18n field (PRD F19, 0049). The text itself stays on the entity.';
comment on column content_translations.source_text is
  'The English the translation was made from. When the entity''s English no longer matches, the translation needs another look.';

create trigger content_translations_set_updated_at
  before update on content_translations for each row execute function set_updated_at();

alter table content_translations enable row level security;

-- Read for every Ops role; no client writes at all. `save_content_translation()` is the only path.
grant select on content_translations to authenticated;
create policy content_translations_ops_read on content_translations
  for select to authenticated using (is_ops());

-- ══════════════════════════════════════════════════════════════════════════════
-- What may be translated
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * The `_i18n` fields a translator may write, per table. A fixed list in one place: the write
 * path, the overview and the Ops page all read it, so a field cannot be translatable in one
 * and not another.
 */
create or replace function translatable_fields(p_entity_table text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_entity_table
    when 'destinations' then
      array['name_i18n', 'overview_i18n', 'best_seasons_i18n', 'seasonal_notes_i18n']
    when 'places' then
      array['name_i18n', 'summary_i18n', 'closure_rules_i18n', 'entry_requirements_i18n',
            'dress_code_i18n', 'hours_note_i18n']
    when 'experiences' then
      array['name_i18n', 'significance_i18n', 'description_i18n', 'advance_booking_how_i18n',
            'eligibility_i18n', 'cost_note_i18n', 'queue_expectation_i18n', 'preparation_i18n']
    else array[]::text[]
  end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- The one write path
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * Saves one non-English value of one translatable field, with its status.
 *
 * SECURITY DEFINER because the translator role has no update policy on knowledge tables, and
 * should not get one: a policy cannot limit an update to one key of one jsonb column. This
 * function can. It writes that key and the status row, and nothing else — not English, not
 * structured fields, not trust, not publish status. The entity's own triggers still record
 * the version and audit entry.
 *
 * An empty text clears the translation: the key is removed and the status row with it.
 */
create or replace function save_content_translation(
  p_entity_table text,
  p_entity_id uuid,
  p_field text,
  p_locale text,
  p_text text,
  p_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
  v_source text;
  v_text text := btrim(coalesce(p_text, ''));
begin
  if not has_any_role('translator', 'editor', 'admin') then
    raise exception 'Translating content needs the translator, editor or admin role'
      using errcode = 'insufficient_privilege';
  end if;

  if p_locale = 'en' then
    raise exception 'English is the source. Change it in the editor.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from locales where code = p_locale and is_active) then
    raise exception 'That language is not active.' using errcode = 'check_violation';
  end if;

  if p_field is null or not (p_field = any (translatable_fields(p_entity_table))) then
    raise exception 'That field cannot be translated here.' using errcode = 'check_violation';
  end if;

  if p_status is null or p_status not in ('ai_draft', 'draft', 'confirmed') then
    raise exception 'A translation is saved as a draft or confirmed.'
      using errcode = 'check_violation';
  end if;

  if length(v_text) > 4000 then
    raise exception 'A translation can be at most 4,000 characters.'
      using errcode = 'check_violation';
  end if;

  -- Table and field are both from the allowlist above, so %I is quoting known names.
  execute format(
    'select true, %I ->> ''en'' from %I where id = $1 and deleted_at is null',
    p_field, p_entity_table)
  into v_found, v_source
  using p_entity_id;

  if v_found is null then
    raise exception 'That entry no longer exists.' using errcode = 'no_data_found';
  end if;

  if nullif(btrim(coalesce(v_source, '')), '') is null then
    raise exception 'There is no English to translate from yet.'
      using errcode = 'check_violation';
  end if;

  if v_text = '' then
    execute format('update %I set %I = coalesce(%I, ''{}''::jsonb) - $1 where id = $2',
                   p_entity_table, p_field, p_field)
      using p_locale, p_entity_id;
    delete from content_translations
     where entity_table = p_entity_table and entity_id = p_entity_id
       and field_name = p_field and locale = p_locale;
    return null;
  end if;

  execute format(
    'update %I set %I = coalesce(%I, ''{}''::jsonb) || jsonb_build_object($1::text, $2::text) where id = $3',
    p_entity_table, p_field, p_field)
  using p_locale, v_text, p_entity_id;

  insert into content_translations
    (entity_table, entity_id, field_name, locale, status, source_text, updated_by, updated_at)
  values
    (p_entity_table, p_entity_id, p_field, p_locale, p_status, v_source, auth.uid(), now())
  on conflict (entity_table, entity_id, field_name, locale) do update
    set status = excluded.status,
        source_text = excluded.source_text,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_status;
end;
$$;

revoke all on function save_content_translation(text, uuid, text, text, text, text) from public, anon;
grant execute on function save_content_translation(text, uuid, text, text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- Completeness per language (O17)
-- ══════════════════════════════════════════════════════════════════════════════

/*
 * For one language: how many translatable fields that have English are confirmed, drafts,
 * written against English that has changed, or missing — and the entities with the most left
 * to do. `p_entity_id` scopes it to one entity, for that entity's translation page.
 *
 * A field counts as confirmed only when a translator confirmed it AND the English is still
 * the English they confirmed it against. Text typed into the editor's language tabs, never
 * reviewed here, counts as a draft.
 */
create or replace function content_translation_overview(
  p_locale text,
  p_limit int default 50,
  p_entity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sources text;
  v_result jsonb;
begin
  if not is_ops() then
    raise exception 'Only Ops can see translation progress' using errcode = 'insufficient_privilege';
  end if;

  if p_locale is null or p_locale = 'en' then
    raise exception 'Choose a language other than English.' using errcode = 'check_violation';
  end if;

  select string_agg(format(
           'select %L::text as entity_table, id as entity_id, '
           || 'coalesce(nullif(btrim(name_i18n ->> ''en''), ''''), slug) as label, '
           || 'f.field, f.value ->> ''en'' as english, coalesce(f.value ? $1, false) as has_target '
           || 'from %I cross join lateral (values %s) as f(field, value) '
           || 'where deleted_at is null and ($3::uuid is null or id = $3)',
           t, t,
           (select string_agg(format('(%L, %I)', c, c), ', ') from unnest(translatable_fields(t)) c)),
         ' union all ')
    into v_sources
    from unnest(array['destinations', 'places', 'experiences']) t;

  execute format($q$
    with sources as (%s),
    fields as (
      select s.entity_table, s.entity_id, s.label, s.has_target, ct.status,
             coalesce(ct.status = 'confirmed' and ct.source_text = s.english, false) as done,
             coalesce(ct.status is not null and ct.source_text is distinct from s.english, false)
               as english_changed
        from sources s
        left join content_translations ct
          on ct.entity_table = s.entity_table and ct.entity_id = s.entity_id
         and ct.field_name = s.field and ct.locale = $1
       where nullif(btrim(coalesce(s.english, '')), '') is not null
    ),
    entities as (
      select entity_table, entity_id, label,
             count(*) as fields,
             count(*) filter (where done) as confirmed,
             count(*) filter (where english_changed) as english_changed
        from fields
       group by entity_table, entity_id, label
    )
    select jsonb_build_object(
      'locale', $1,
      'fields', (select count(*) from fields),
      'confirmed', (select count(*) filter (where done) from fields),
      'drafts', (select count(*) filter (
                   where (status in ('draft', 'ai_draft') and not english_changed)
                      or (status is null and has_target)) from fields),
      'english_changed', (select count(*) filter (where english_changed) from fields),
      'missing', (select count(*) filter (where status is null and not has_target) from fields),
      'next', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'entity_table', e.entity_table, 'entity_id', e.entity_id, 'label', e.label,
                 'fields', e.fields, 'confirmed', e.confirmed,
                 'english_changed', e.english_changed)
               order by e.fields - e.confirmed desc, e.label)
          from (select * from entities
                 where confirmed < fields
                 order by fields - confirmed desc, label
                 limit $2) e), '[]'::jsonb)
    )
  $q$, v_sources)
  into v_result
  using p_locale, least(greatest(coalesce(p_limit, 50), 1), 200), p_entity_id;

  return v_result;
end;
$$;

revoke all on function content_translation_overview(text, int, uuid) from public, anon;
grant execute on function content_translation_overview(text, int, uuid) to authenticated;
