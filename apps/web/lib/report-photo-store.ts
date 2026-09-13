import type { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { reportPhotoPath, type ReportPhoto } from "./report-photo";

type ServiceClient = ReturnType<typeof createServiceRoleSupabase>;

export type StoreReportPhotoResult =
  | { ok: true; mediaId: string }
  | { ok: false; stage: "upload" | "record" | "attach"; cause: unknown };

/**
 * Puts a validated report photo in the private `reports` bucket and attaches it to the
 * report (PRD F14, D-016, migration 0036).
 *
 * SERVICE ROLE, and only here. No client role holds any policy on the `reports` bucket, and
 * `media_assets` rows in that bucket are invisible to every client — so the traveler's
 * session could not do this even if it were asked to. The report row itself was already
 * written with the traveler's session, under their RLS; this only adds the photo to it.
 *
 * Every step undoes the ones before it when it cannot finish. A photo that is stored but
 * not attached is a traveler's picture sitting in a bucket with no report to explain it,
 * which is the one outcome worse than the photo not arriving.
 */
export async function storeReportPhoto(
  service: ServiceClient,
  reportId: string,
  photo: ReportPhoto,
  now: Date = new Date(),
): Promise<StoreReportPhotoResult> {
  const path = reportPhotoPath(now, crypto.randomUUID());
  const bucket = service.storage.from("reports");

  const upload = await bucket.upload(path, photo.bytes, {
    // Decided here, never taken from the request: the bytes were parsed as a JPEG.
    contentType: "image/jpeg",
    upsert: false,
  });
  if (upload.error) return { ok: false, stage: "upload", cause: upload.error };

  const asset = await service
    .from("media_assets")
    .insert({
      storage_path: path,
      storage_bucket: "reports",
      media_type: "image",
      width: photo.width,
      height: photo.height,
      // Deliberately null: the row's history is Ops-readable (0036 header).
      uploaded_by: null,
    })
    .select("id")
    .single();

  if (asset.error || !asset.data) {
    await bucket.remove([path]);
    return { ok: false, stage: "record", cause: asset.error };
  }

  const link = await service
    .from("user_reports")
    .update({ media_id: asset.data.id })
    .eq("id", reportId);

  if (link.error) {
    await service.from("media_assets").delete().eq("id", asset.data.id);
    await bucket.remove([path]);
    return { ok: false, stage: "attach", cause: link.error };
  }

  return { ok: true, mediaId: asset.data.id };
}
