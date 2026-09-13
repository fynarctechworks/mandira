-- ══════════════════════════════════════════════════════════════════════════════
-- 0040 · Report photos are kept only as long as they serve the report (D-177, DPDP)
--
-- A report photo (0036) exists so a person checking the report can see what the traveler
-- saw. Once the report is resolved that purpose is served, and a picture a traveler took —
-- which can show people, number plates, the traveler's own family — has no reason to stay.
--
--   * A photo is removed 30 days after its report is resolved or closed: long enough for a
--     second look or a follow-up question, short enough not to become an archive.
--   * A report nobody resolved keeps its photo for 180 days from filing, then loses it: an
--     unanswered report that old is not being worked, and the photo is not the reason why.
--
-- The report itself stays (pseudonymous as before); only the photo goes. Storage objects
-- cannot be deleted from SQL — Supabase refuses direct writes to its storage tables — so the
-- database says what is due and forgets rows, and `/api/cron/report-photos` removes the files
-- through the Storage API. The route is dispatched daily by pg_cron like the other app jobs.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── What is due ─────────────────────────────────────────────────────────────────────────

create or replace function report_photos_due(p_limit int default 100)
returns table (media_id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.storage_path
  from user_reports r
  join media_assets m on m.id = r.media_id and m.storage_bucket = 'reports'
  where (
      r.status in ('resolved_updated', 'resolved_confirmed_correct',
                   'resolved_unverifiable', 'closed')
      and coalesce(r.resolved_at, r.updated_at) < now() - interval '30 days'
    )
    or r.created_at < now() - interval '180 days'
  order by r.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function report_photos_due(int) is
  'Report photos past retention: 30 days after resolution, or 180 days after filing (D-177).';

revoke all on function report_photos_due(int) from public, anon, authenticated;
grant execute on function report_photos_due(int) to service_role;

-- ── Forgetting one, once its file is gone ───────────────────────────────────────────────

create or replace function forget_report_photo(p_media_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update user_reports set media_id = null where media_id = p_media_id;
  delete from media_assets where id = p_media_id and storage_bucket = 'reports';
  return found;
end;
$$;

comment on function forget_report_photo(uuid) is
  'Detaches a report photo and deletes its media row after the file is removed (D-177).';

revoke all on function forget_report_photo(uuid) from public, anon, authenticated;
grant execute on function forget_report_photo(uuid) to service_role;

-- ── The daily job: one more route for the dispatcher (0037) ─────────────────────────────

create or replace function dispatch_app_cron(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path    text;
  v_base    text;
  v_secret  text;
  v_request bigint;
begin
  v_path := case p_name
    when 'send_notifications' then '/api/cron/notifications'
    when 'refresh_live_feeds' then '/api/cron/feeds'
    when 'purge_report_photos' then '/api/cron/report-photos'
  end;
  if v_path is null then
    raise exception 'Unknown app cron: %', p_name;
  end if;

  /*
   * The answer to the previous dispatch arrives asynchronously in net._http_response. A route
   * that answered 401 or 500, or timed out, marks that earlier run failed, so a wrong secret
   * or a broken deploy reaches the dashboard within one interval instead of never.
   */
  update job_runs r
  set status = 'failed',
      detail = coalesce(r.detail, '{}'::jsonb)
        || jsonb_build_object('http_status', resp.status_code, 'timed_out', resp.timed_out)
  from net._http_response resp
  where r.job_name = p_name
    and r.status = 'succeeded'
    and r.started_at > now() - interval '2 days'
    and (r.detail ->> 'request_id') is not null
    and (r.detail ->> 'request_id')::bigint = resp.id
    and (resp.timed_out or resp.status_code is null or resp.status_code >= 300);

  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'mandhira_web_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'mandhira_cron_secret';

  if coalesce(v_base, '') = '' or coalesce(v_secret, '') = '' then
    insert into job_runs (job_name, status, finished_at, detail)
    values (p_name, 'failed', now(), jsonb_build_object('reason', 'not_configured'));
    return jsonb_build_object('configured', false);
  end if;

  select net.http_get(
    url := rtrim(v_base, '/') || v_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  ) into v_request;

  -- "succeeded" means dispatched; the next dispatch corrects it if the route did not answer 2xx.
  insert into job_runs (job_name, status, finished_at, detail)
  values (p_name, 'succeeded', now(), jsonb_build_object('request_id', v_request));

  return jsonb_build_object('configured', true, 'request_id', v_request);
end;
$$;

revoke all on function dispatch_app_cron(text) from public, anon, authenticated;

create or replace view v_job_health as
select
  expected.job_name,
  expected.interval_seconds,
  last.started_at as last_run_at,
  last.status as last_status,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    as missed_two_windows,
  last.started_at is null
    or last.started_at < now() - make_interval(secs => expected.interval_seconds * 2)
    or last.status <> 'succeeded'
    as needs_attention
from (values
  ('recompute_freshness', 86400),
  ('roll_journey_statuses', 3600),
  ('purge_deleted_accounts', 86400),
  ('prune_ai_cache', 86400),
  ('prune_rate_limits', 86400),
  ('publish_scheduled_entities', 300),
  ('send_notifications', 600),
  ('refresh_live_feeds', 7200),
  ('purge_report_photos', 86400)
) as expected(job_name, interval_seconds)
left join lateral (
  select r.started_at, r.status
  from job_runs r
  where r.job_name = expected.job_name and r.status <> 'skipped'
  order by r.started_at desc
  limit 1
) as last on true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge_report_photos') then
    perform cron.unschedule('purge_report_photos');
  end if;
  -- 03:10 IST, after the other nightly jobs.
  perform cron.schedule('purge_report_photos', '40 21 * * *',
                        $job$select dispatch_app_cron('purge_report_photos')$job$);
end;
$$;

-- ── The traveler's own export says a photo was attached ─────────────────────────────────
--
-- The export carries information about the person, not files (0033). Whether a report had a
-- photo is that information; the photo itself stays in the private bucket until retention
-- removes it.

create or replace function export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select (select auth.uid()) as id)
  select case when (select id from me) is null then null else jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                  from auth.users u where u.id = (select id from me)),
    'profile', (select to_jsonb(p) from profiles p where p.id = (select id from me)),
    'travelers', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at)
        from traveler_profiles t where t.owner_user_id = (select id from me)), '[]'::jsonb),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'journey', to_jsonb(j),
        'destinations', coalesce((select jsonb_agg(to_jsonb(d) order by d.sort_order)
                                    from journey_destinations d where d.journey_id = j.id), '[]'::jsonb),
        'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.day_index, i.sort_order)
                             from journey_items i where i.journey_id = j.id), '[]'::jsonb),
        'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
                             from journey_item_notes n
                             join journey_items i on i.id = n.item_id
                            where i.journey_id = j.id), '[]'::jsonb),
        'prepare_tasks', coalesce((select jsonb_agg(to_jsonb(pt) order by pt.sort_order)
                                     from prepare_tasks pt where pt.journey_id = j.id), '[]'::jsonb),
        'changes', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                               from journey_change_events c where c.journey_id = j.id), '[]'::jsonb),
        'record', (select to_jsonb(r) from journey_records r where r.journey_id = j.id),
        'shares', coalesce((select jsonb_agg(jsonb_build_object(
                                     'created_at', s.created_at, 'expires_at', s.expires_at))
                              from journey_shares s where s.journey_id = j.id), '[]'::jsonb)
      ) order by j.created_at)
        from journeys j where j.owner_user_id = (select id from me)), '[]'::jsonb),
    'saved_places', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at)
        from saved_places s where s.user_id = (select id from me)), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
        from notifications n where n.user_id = (select id from me)), '[]'::jsonb),
    'push_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_agent', ns.user_agent, 'created_at', ns.created_at,
               'last_success_at', ns.last_success_at) order by ns.created_at)
        from notification_subscriptions ns where ns.user_id = (select id from me)), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'report_type', r.report_type, 'entity_table', r.entity_table,
               'entity_id', r.entity_id, 'field_name', r.field_name,
               'description', r.description, 'status', r.status,
               'resolution_note', r.resolution_note, 'created_at', r.created_at,
               'has_photo', r.media_id is not null)
             order by r.created_at)
        from user_reports r where r.user_id = (select id from me)), '[]'::jsonb),
    'personalization_signals', coalesce((
      select jsonb_agg(to_jsonb(ps) order by ps.created_at)
        from personalization_signals ps where ps.user_id = (select id from me)), '[]'::jsonb)
  ) end;
$$;
