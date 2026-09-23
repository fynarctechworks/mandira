-- 0055_report_outcome_in_notice.sql — the traveler is told WHAT happened to their report.
--
-- PRD F14: "Later: notification when resolved ('Updated' / 'Confirmed as correct' /
-- 'Couldn't verify')." Everything needed was already here — three resolved statuses, and
-- 0039 even wrote the outcome into the notification's payload — but the text ignored it.
-- Every traveler got the same sentence, "What you told us about has been looked at", so
-- someone who reported that a temple's evening timing had changed never learned whether
-- we changed it, found it was right all along, or could not find out.
--
-- That matters beyond courtesy. "Couldn't verify" is itself information: the timing is
-- still uncertain, and the traveler who reported it is the one most likely to check it
-- again on the ground. A report that disappears into "looked at" teaches people not to
-- report.
--
-- 0039's function, with one change: the body key names the outcome. Keys, never sentences,
-- as before — the traveler's language is decided when the notice is sent.

create or replace function notify_report_resolution(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid;
  v_status   text;
  v_notified boolean;
  v_outcome  text;
begin
  -- The same roles that may resolve a report (AUTHORIZATION_MODEL).
  if not has_any_role('admin', 'editor', 'verifier', 'support') then
    raise exception 'Only the reports team can close the loop on a report.'
      using errcode = '42501';
  end if;

  select user_id, status::text, notified_user
  into v_user, v_status, v_notified
  from user_reports
  where id = p_report_id
  for update;

  -- Nothing to tell: unknown, not yet resolved, already told, or filed without an account.
  if not found or v_status not like 'resolved\_%' or v_notified or v_user is null then
    return false;
  end if;

  v_outcome := case v_status
    when 'resolved_updated' then 'updated'
    when 'resolved_confirmed_correct' then 'confirmed'
    else 'unverified'
  end;

  /*
   * In the app always; by email only if the traveler opted in — the sender decides that at
   * send time from their own switches (D-171).
   *
   * The title stays shared ("Thanks — we checked that"); the BODY says which of the three
   * it was (0055). One key per outcome rather than a placeholder filled with a word,
   * because the three sentences are different sentences in Telugu and Hindi, not the same
   * sentence with a different noun in it.
   */
  insert into notifications
    (user_id, notification_type, channel, status, scheduled_for, title_i18n, body_i18n, payload)
  select v_user, 'report_resolved', channel, 'scheduled', now(),
         '{"key": "notify.report_resolved.title"}'::jsonb,
         jsonb_build_object('key', 'notify.report_resolved.body_' || v_outcome),
         jsonb_build_object('outcome', v_outcome)
  from unnest(array['inapp', 'email']) as channel;

  update user_reports set notified_user = true where id = p_report_id;

  return true;
end;
$$;

comment on function notify_report_resolution(uuid) is
  'Queues a resolved report''s notice to its reporter, saying which outcome it was (PRD F14, 0055), without exposing who the reporter is (D-174).';
