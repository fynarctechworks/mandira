-- 0054_adult_accounts_and_dpdp_contacts.sql — PRD-PRIV-004 and PRD-PRIV-005.
--
-- Two DPDP obligations that the product asserted in prose and enforced nowhere.
--
-- PRD-PRIV-004 "no under-18 accounts" was a sentence in the PRD. Nothing asked, nothing
-- recorded, nothing stopped it. It is now asked at sign-in, recorded on the profile, and
-- enforced in the one place data can contradict it: the traveler's own entry in their own
-- party. Companions may be children — that is the whole point of an age band — but the
-- person holding the account may not be.
--
-- PRD-PRIV-005 needs a consent notice and a named grievance contact. Both are founder
-- text, not engineering text, so they live in a table an admin edits rather than in a
-- deploy: a grievance officer changes, and waiting for a release to say so is exactly the
-- failure the obligation exists to prevent. The app shows what is set and says plainly
-- when nothing is.

-- ══════════════════════════════════════════════════════════════════════════════
-- PRD-PRIV-004 — the account holder is an adult
-- ══════════════════════════════════════════════════════════════════════════════

alter table profiles add column adult_confirmed_at timestamptz;

comment on column profiles.adult_confirmed_at is
  'When the account holder confirmed they are 18 or older (PRD-PRIV-004, 0054). Null means they have not been asked yet — accounts predating this column.';

/*
 * The data rule behind the sentence.
 *
 * `is_self` marks the traveler who owns the account. A child band there would mean an
 * under-18 account however the sign-in box was ticked, so the constraint is on the row
 * rather than on the checkbox. A trigger and not a CHECK because the rule spans two
 * columns of the same row plus an enum we may extend, and because the message matters:
 * an operator or a traveler meeting this should be told what it means.
 */
create or replace function traveler_profiles_self_is_adult()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_self and new.age_band = 'child' then
    raise exception 'The person holding the account must be 18 or older (PRD-PRIV-004). A child can travel with you as a companion.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger traveler_profiles_self_is_adult
  before insert or update on traveler_profiles
  for each row execute function traveler_profiles_self_is_adult();

-- ══════════════════════════════════════════════════════════════════════════════
-- PRD-PRIV-005 — the consent notice and the grievance contact
-- ══════════════════════════════════════════════════════════════════════════════

create table legal_notices (
  key        text primary key,
  body_i18n  jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table legal_notices is
  'DPDP text an admin edits without a deploy (PRD-PRIV-005, 0054): the consent notice shown at sign-in and the grievance contact. Public, by design — a notice nobody can read is not a notice.';
comment on column legal_notices.key is
  'A fixed key the app renders: consent_notice, grievance_contact, privacy_policy.';

create trigger legal_notices_set_updated_at
  before update on legal_notices for each row execute function set_updated_at();

alter table legal_notices enable row level security;

/*
 * Readable by everyone, including a signed-out visitor deciding whether to sign in at all.
 * That is the point of a consent notice: it has to be readable BEFORE consenting.
 */
grant select on legal_notices to anon, authenticated;
create policy legal_notices_public_read on legal_notices
  for select using (true);

-- Only an admin writes it. This is a legal statement in the company's name.
grant insert, update on legal_notices to authenticated;
create policy legal_notices_admin_write on legal_notices
  for insert to authenticated with check (has_any_role('admin'));
create policy legal_notices_admin_update on legal_notices
  for update to authenticated using (has_any_role('admin'))
  with check (has_any_role('admin'));

/*
 * The three keys exist from the start with EMPTY bodies, deliberately.
 *
 * An empty row is a visible hole in the Ops screen and an honest "not published yet" in
 * the app. Seeding plausible-looking placeholder text would be worse than saying nothing:
 * a traveler would read invented legal wording as the company's actual undertaking.
 */
insert into legal_notices (key) values
  ('consent_notice'),
  ('grievance_contact'),
  ('privacy_policy')
on conflict (key) do nothing;

/*
 * Whether the app has what it needs to launch. Used by the privacy screen to decide
 * between showing the notice and saying plainly that it has not been published, and by
 * the Ops dashboard so nobody discovers this on launch day.
 */
create or replace function legal_notices_ready()
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1 from legal_notices
     where key in ('consent_notice', 'grievance_contact')
       and coalesce(body_i18n ->> 'en', '') = ''
  );
$$;

comment on function legal_notices_ready() is
  'False until an admin has published both the consent notice and the grievance contact in English (PRD-PRIV-005).';

grant execute on function legal_notices_ready() to anon, authenticated;
