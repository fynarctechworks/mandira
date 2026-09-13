-- 0036_media_crops_report_photos.sql — crop presets for media (PRD-OPS-CNT-003) and photos
-- on traveler reports (PRD F14, D-016, M4).
--
-- Additive throughout: three columns with defaults, one column grant, restrictive policies
-- that only ever narrow, two guard triggers, and a tighter limit on a bucket that holds no
-- objects yet. No existing policy, grant or trigger is dropped.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY A FOCAL POINT RATHER THAN A CROP RECTANGLE PER PRESET
-- ══════════════════════════════════════════════════════════════════════════════
--
-- PRD §12 names two presets — hero 3:2 and card 4:3 — and D-055 keeps ONE original per
-- asset, with sizes produced on delivery. A focal point is the one fact that yields a
-- correct crop for every ratio, including ratios nobody has designed yet; a rectangle per
-- preset would need a new column (and a re-crop of the whole library) the day a third
-- ratio appears. Rendering uses CSS `object-position` from the point, which works whether
-- or not Supabase image transformations are enabled on the project.
--
-- Adding a column with a constant default does not rewrite rows and fires no row
-- triggers, so the version history and audit trail from 0029 carry on unchanged: the next
-- edit of an asset snapshots the new columns like any other.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY REPORT PHOTOS ARE media_assets ROWS THAT NO CLIENT CAN SEE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- TRD §4.7 is specific: `user_reports.media_id uuid fk media_assets` (bucket `reports`).
-- But `media_assets` is the Ops media library — every Ops role reads it, and its rows are
-- snapshotted into `entity_versions`. PRD §10 allows a report photo to be seen by Support,
-- Verifier, Editor and Admin only, with the reporter pseudonymised. So:
--
--   * `storage_bucket` says which bucket a row's object lives in. Restrictive policies
--     keep every client role — Ops included — to rows in the public `media` bucket. A
--     report photo row is reachable only by the server, which signs a 15-minute URL for an
--     operator who could already read the report (TRD §8 storage).
--   * The object path is random (`yyyy/mm/<uuid>.jpg`) and `uploaded_by` stays null, so
--     neither the row nor its version snapshot carries the reporter's identity.
--   * The `reports` bucket has NO client storage policy — no insert, no select, no list.
--     The server route writes it with the service role after validating and re-stripping
--     the image. That is stricter than a per-user folder policy, and deliberately so: a
--     folder named after the user id would put the reporter's identity into a path that
--     Ops-readable history keeps.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Columns
-- ══════════════════════════════════════════════════════════════════════════════

alter table media_assets
  add column focal_x numeric(4, 3) not null default 0.5
    constraint media_assets_focal_x_range check (focal_x >= 0 and focal_x <= 1),
  add column focal_y numeric(4, 3) not null default 0.5
    constraint media_assets_focal_y_range check (focal_y >= 0 and focal_y <= 1),
  add column storage_bucket text not null default 'media'
    constraint media_assets_storage_bucket_check check (storage_bucket in ('media', 'reports'));

comment on column media_assets.focal_x is
  'Horizontal focal point, 0 (left) to 1 (right). Every crop preset keeps it in frame (PRD-OPS-CNT-003).';
comment on column media_assets.focal_y is
  'Vertical focal point, 0 (top) to 1 (bottom).';
comment on column media_assets.storage_bucket is
  'Bucket holding the object. ''reports'' rows are traveler photos: invisible to every client role (0036).';

-- Travelers render published images, so the point is readable wherever the image is.
-- `storage_bucket` is withheld: no client needs it, and policies read it without a grant.
grant select (focal_x, focal_y) on media_assets to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Client roles see and write only the media library
-- ══════════════════════════════════════════════════════════════════════════════
--
-- RESTRICTIVE, so they AND with the existing permissive policies (0008, 0029) rather than
-- replacing them. The server's service role bypasses RLS and is the only writer of
-- report-photo rows.

create policy media_assets_library_only_read on media_assets
  as restrictive for select to anon, authenticated
  using (storage_bucket = 'media');

create policy media_assets_library_only_insert on media_assets
  as restrictive for insert to authenticated
  with check (storage_bucket = 'media');

create policy media_assets_library_only_update on media_assets
  as restrictive for update to authenticated
  using (storage_bucket = 'media')
  with check (storage_bucket = 'media');

create policy media_assets_library_only_delete on media_assets
  as restrictive for delete to authenticated
  using (storage_bucket = 'media');

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. A report photo never becomes published content
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A trigger rather than a policy because it must hold for every role, the service role
-- included, and because an RLS subquery cannot see the row it would need to refuse.

create or replace function guard_entity_media_library_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from media_assets m
     where m.id = new.media_id
       and m.storage_bucket <> 'media'
  ) then
    raise exception 'A traveler''s report photo cannot be attached to content'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function guard_entity_media_library_asset() is
  'Refuses attaching a reports-bucket asset to an entity (0036). Report photos are unlicensed and private.';

create trigger entity_media_library_asset
  before insert or update of media_id on entity_media
  for each row execute function guard_entity_media_library_asset();

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Only the server attaches a photo to a report, and only a reports-bucket photo
-- ══════════════════════════════════════════════════════════════════════════════
--
-- A traveler holds INSERT on user_reports (0030). Without this, they could file a report
-- whose media_id points at any asset id they learned — and the Ops queue would sign a URL
-- for it. The photo is attached by the route after it has validated the bytes itself.

create or replace function guard_user_report_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.media_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.media_id is not distinct from old.media_id then
    return new;
  end if;

  if request_is_client() then
    raise exception 'A report photo is attached by the server, not by the client'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from media_assets m
     where m.id = new.media_id
       and m.storage_bucket = 'reports'
  ) then
    raise exception 'A report photo must live in the private reports bucket'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function guard_user_report_photo() is
  'Refuses a client-set user_reports.media_id, and any media_id outside the reports bucket (0036).';

create trigger user_reports_photo_guard
  before insert or update of media_id on user_reports
  for each row execute function guard_user_report_photo();

-- Trigger functions: nobody calls these directly (0030 baseline — clients get nothing).
revoke all on function guard_entity_media_library_asset() from public, anon, authenticated;
revoke all on function guard_user_report_photo() from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. The `reports` bucket holds exactly what the route produces
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Created in 0011 as private with jpeg/png/webp up to 5 MB and never used. The route
-- re-encodes on the device and re-validates on the server, so what arrives is a JPEG of at
-- most 1.5 MB; the bucket refuses anything else even from a server bug.
--
-- No policy on storage.objects is added for this bucket, on purpose: see the header.

update storage.buckets
   set public = false,
       file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg']
 where id = 'reports';
