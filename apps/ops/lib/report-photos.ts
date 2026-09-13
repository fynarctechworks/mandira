import type { Enums } from "@mandhira/db";
import type { createServiceRoleSupabase } from "@mandhira/db/client/server";

type ServiceClient = ReturnType<typeof createServiceRoleSupabase>;

/**
 * Photos on traveler reports, as the Reports queue shows them (PRD F14 and §10, D-016,
 * migration 0036).
 *
 * No client role can list or read the `reports` bucket, and a report photo's
 * `media_assets` row is invisible to every client — Ops included. The only way a photo
 * reaches a screen is a signed URL produced here, on the server, for a report the operator
 * could already read through RLS.
 */

/** TRD §8: private buckets are reached through signed URLs that last 15 minutes. */
export const REPORT_PHOTO_URL_SECONDS = 15 * 60;

/** PRD §10: "photos and text are visible only to Ops roles Support, Verifier, Editor, Admin". */
const MAY_VIEW: readonly Enums<"ops_role_enum">[] = ["support", "verifier", "editor", "admin"];

export function mayViewReportPhotos(roles: readonly Enums<"ops_role_enum">[]): boolean {
  return roles.some((role) => MAY_VIEW.includes(role));
}

/**
 * Signed URLs keyed by media id, or null when they could not be produced (the queue then
 * says the photo did not load, rather than pretending there is none).
 *
 * `service` must be the service-role client. Only ids that were read from `user_reports`
 * as the operator should be passed in, and only reports-bucket assets are signed — a
 * library image id is ignored, never turned into a link.
 */
export async function signReportPhotos(
  service: ServiceClient,
  mediaIds: readonly string[],
): Promise<Map<string, string> | null> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return new Map();

  const assets = await service
    .from("media_assets")
    .select("id, storage_path")
    .in("id", ids)
    .eq("storage_bucket", "reports")
    .is("deleted_at", null);

  if (assets.error) return null;
  if (!assets.data || assets.data.length === 0) return new Map();

  const signed = await service.storage.from("reports").createSignedUrls(
    assets.data.map((asset) => asset.storage_path),
    REPORT_PHOTO_URL_SECONDS,
  );

  if (signed.error) return null;
  return pairSignedUrls(assets.data, signed.data ?? []);
}

/** Matches each asset to its signed URL by path; an entry that failed to sign is left out. */
export function pairSignedUrls(
  assets: readonly { id: string; storage_path: string }[],
  signed: readonly { path: string | null; signedUrl: string | null; error: string | null }[],
): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const entry of signed) {
    if (entry.path && entry.signedUrl && !entry.error) byPath.set(entry.path, entry.signedUrl);
  }

  const urls = new Map<string, string>();
  for (const asset of assets) {
    const url = byPath.get(asset.storage_path);
    if (url) urls.set(asset.id, url);
  }
  return urls;
}
