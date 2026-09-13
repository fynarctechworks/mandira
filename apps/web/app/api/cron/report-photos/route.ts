import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { reportServerError } from "../../../../lib/report";

/**
 * Removing report photos past retention (D-177, migration 0040).
 *
 * The database decides what is due — 30 days after a report is resolved, or 180 days after it
 * was filed if nobody resolved it — and this route deletes the files, because Supabase does
 * not allow storage objects to be deleted from SQL. Dispatched nightly by pg_cron.
 *
 * Files first, rows second. A run cut off between the two leaves rows whose files are already
 * gone; the next run lists them again, removing a missing file is not an error, and the rows
 * are forgotten then. The reverse order could leave a traveler's photo in the bucket with no
 * row left to find it by.
 */
export const dynamic = "force-dynamic";

/** One night's work; anything beyond this waits for tomorrow's run. */
const BATCH = 100;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  // No secret configured means the endpoint is closed, not open.
  if (!secret) return new Response(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();
  const headers = { "cache-control": "no-store" };

  const { data: due, error } = await supabase.rpc("report_photos_due", { p_limit: BATCH });
  if (error) {
    reportServerError({ route: "GET /api/cron/report-photos", error, app: "web" });
    return Response.json({ ok: false }, { status: 503, headers });
  }

  const photos = due ?? [];
  if (photos.length === 0) {
    return Response.json({ ok: true, removed: 0, forgotten: 0 }, { headers });
  }

  const { error: removeError } = await supabase.storage
    .from("reports")
    .remove(photos.map((photo) => photo.storage_path));

  if (removeError) {
    reportServerError({ route: "GET /api/cron/report-photos", error: removeError, app: "web" });
    return Response.json({ ok: false }, { status: 503, headers });
  }

  let forgotten = 0;
  for (const photo of photos) {
    const { data, error: forgetError } = await supabase.rpc("forget_report_photo", {
      p_media_id: photo.media_id,
    });
    if (forgetError) {
      reportServerError({ route: "GET /api/cron/report-photos", error: forgetError, app: "web" });
      continue;
    }
    if (data) forgotten += 1;
  }

  return Response.json(
    { ok: true, removed: photos.length, forgotten, at: new Date().toISOString() },
    { headers },
  );
}
