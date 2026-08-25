-- 0009_auth.sql — profile provisioning and separation of duties (AUTH-04, AUTH-05).
--
-- Auth itself is Supabase's (magic link + Google, D-009). What the database owns is what
-- happens around it: every signed-up user gets a profile row, and the approve step
-- refuses to let one person both make and bless a change.

-- ══════════════════════════════════════════════════════════════════════════════
-- AUTH-04 — profiles are created by the database, not by application code
--
-- Doing this in a trigger rather than in the sign-in callback means a user created by
-- ANY route — magic link, Google, the Supabase dashboard, a seed script — ends up with a
-- profile. A callback-based approach silently misses every path but its own.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_locale text := meta ->> 'locale';
begin
  insert into profiles (id, display_name, locale)
  values (
    new.id,
    -- Google supplies full_name/name; magic link supplies nothing, so fall back to the
    -- local part of the address rather than leaving the profile nameless.
    nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', split_part(new.email, '@', 1))), ''),
    -- Never trust a client-supplied locale: an unknown value would violate the FK and
    -- fail the whole sign-up. Fall back to 'en' unless the locale is one we actually run.
    coalesce(
      (select l.code from locales l where l.code = requested_locale and l.is_active),
      'en'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function handle_new_user() is
  'Creates the profile row for a new auth user (AUTH-04). Locale is validated against `locales`.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ══════════════════════════════════════════════════════════════════════════════
-- AUTH-05 — separation of duties on approval (PRD-OPS-WF-009, TRD §6.1)
--
-- "review_tasks decision rejects if completed_by = entity's last changed_by for approve
-- tasks." Enforced in SQL because AUTHORIZATION_MODEL requires workflow constraints at
-- the database layer — a check that lives only in a route handler is one refactor away
-- from being bypassed.
-- ══════════════════════════════════════════════════════════════════════════════

create or replace function enforce_approval_separation()
returns trigger
language plpgsql
as $$
declare
  last_editor uuid;
begin
  -- Only applies to approve tasks being completed.
  if new.task_type <> 'approve' or new.status <> 'done' then
    return new;
  end if;

  if new.completed_by is null then
    raise exception 'An approve task must record who completed it'
      using errcode = 'check_violation';
  end if;

  if new.entity_table is null or new.entity_id is null then
    return new;
  end if;

  select v.changed_by
    into last_editor
    from entity_versions v
   where v.entity_table = new.entity_table
     and v.entity_id = new.entity_id
     and v.changed_by is not null
   order by v.version desc
   limit 1;

  if last_editor is not null and last_editor = new.completed_by then
    raise exception
      'Separation of duties: the person who last changed this cannot also approve it'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_approval_separation() is
  'PRD-OPS-WF-009: blocks self-approval by comparing completed_by to the last entity_versions.changed_by.';

create trigger review_tasks_separation_of_duties
  before insert or update on review_tasks
  for each row execute function enforce_approval_separation();
