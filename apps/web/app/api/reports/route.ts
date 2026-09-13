import { ApiError } from "@mandhira/db/api";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { z } from "zod";

import { DEVICE_COOKIE, withApi } from "../../../lib/api";
import { reportServerError } from "../../../lib/report";
import {
  REPORT_PHOTO_BASE64_MAX,
  base64ToBytes,
  sanitizeReportPhoto,
} from "../../../lib/report-photo";
import { storeReportPhoto } from "../../../lib/report-photo-store";

const PHOTO_UNUSABLE = "That photo can't be used. Try another one, or send the report without it.";

/**
 * A traveler telling us something is wrong (PRD F14, PRD-REPT-001/002).
 *
 * The most important sentence in F14 is "reports are signals, never truth". Nothing here
 * publishes anything. A report is tier T5 — the weakest evidence the trust model has — and
 * it enters the Ops queue for a human to verify against a real source. What it CAN do
 * without a human is trip the automatic downgrade (three independent reporters on one
 * field within 14 days sets that field to "check locally"), and that is a downgrade, never
 * an assertion.
 *
 * SIGNED IN ONLY, and NOT because that is the better product.
 *
 * The person who notices a temple's timings are wrong is standing in front of it, and
 * requiring an account first is how that observation is lost — so guest reporting is what
 * this route wanted to do. The schema says otherwise: `user_reports` grants INSERT to
 * `authenticated` alone, with a check that the row's `user_id` is the caller. There is no
 * anon policy and no anon grant.
 *
 * That is a real disagreement with the table's own shape — `user_id` is nullable and
 * `reporter_hash` exists precisely for a reporter with no account — and PRD F14 does not
 * settle it either way. Widening the only anon write surface besides analytics, on a table
 * holding free text, is a decision worth making deliberately rather than in passing.
 *
 * So this follows the policy and the disagreement is raised as OPEN-013. The reporter hash
 * is still computed and stored for signed-in reporters, because PRD-REPT-004's downgrade
 * counts DISTINCT reporters and that is what tells three people apart from one person
 * reporting three times.
 */
const schema = z.object({
  reportType: z.enum([
    "timing_changed",
    "closed",
    "accessibility_issue",
    "wrong_information",
    "outdated_guidance",
    "other",
  ]),
  entityTable: z.enum(["places", "experiences", "routes", "destinations"]),
  entityId: z.string().uuid(),
  /** Which field, when the traveler is reporting on a specific fact. */
  fieldName: z.string().max(64).optional(),
  // PRD F14's own limit. Long enough to say what changed, short enough that nobody writes
  // a letter nobody will read.
  description: z.string().max(500).optional(),
  /**
   * PRD F14: journey context is attached WITH CONSENT. It defaults to absent, so a report
   * carries no link to the traveler's plan unless they said it could.
   */
  journeyId: z.string().uuid().optional(),
  locale: z.string().max(8).optional(),
  /**
   * PRD F14's optional photo (M4, D-016): one JPEG, base64, already re-encoded on the
   * device. Only the bytes are accepted — no name, path, bucket or content type, because
   * the server decides all of those (lib/report-photo). The ceiling keeps the whole
   * request comfortably inside a serverless body limit.
   */
  photo: z
    .string()
    .max(REPORT_PHOTO_BASE64_MAX, PHOTO_UNUSABLE)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, PHOTO_UNUSABLE)
    .optional(),
});

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "reports_create",
  handler: async ({ input, request, supabase, user }) => {
    /*
     * The photo is checked before anything is written, so an unusable one costs the
     * traveler a retry rather than a half-filed report. The device already stripped EXIF;
     * this strips it again, because the device is not the one we trust.
     */
    const photo = input.photo
      ? sanitizeReportPhoto(base64ToBytes(input.photo) ?? new Uint8Array())
      : null;
    if (input.photo && !photo) {
      throw new ApiError("invalid", PHOTO_UNUSABLE, { photo: [PHOTO_UNUSABLE] });
    }

    /*
     * The reporter hash tells three separate people apart from one person reporting three
     * times — the distinction PRD-REPT-004's downgrade rule turns on. Derived from the
     * device cookie, never from an IP: TRD §6.2 keys on sessions and DPDP treats an IP as
     * personal data.
     */
    const reporterHash = await hashOf(deviceIdFrom(request));

    const { data, error } = await supabase
      .from("user_reports")
      .insert({
        user_id: user!.id,
        reporter_hash: reporterHash,
        report_type: input.reportType,
        entity_table: input.entityTable,
        entity_id: input.entityId,
        field_name: input.fieldName ?? null,
        description: input.description ?? null,
        journey_id: input.journeyId ?? null,
        locale: input.locale ?? null,
        client_created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) throw new ApiError("failed");

    /*
     * The report is filed; the photo is added to it. If the photo cannot be stored the
     * report still stands — what the traveler saw matters more than the picture of it —
     * and the response says the photo did not arrive rather than letting them assume.
     */
    let photoAttached = false;
    if (photo) {
      const stored = await storeReportPhoto(createServiceRoleSupabase(), data.id, photo);
      photoAttached = stored.ok;
      if (!stored.ok) {
        reportServerError({
          route: "POST /api/reports",
          error: stored.cause ?? new Error(`report photo not stored at ${stored.stage}`),
          app: "web",
        });
      }
    }

    // PRD F14's own words, and the whole promise: somebody will look, and it will not be
    // published until they have.
    return { received: true, photoAttached, message: "Thanks — our team will verify this." };
  },
});

function deviceIdFrom(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  const match = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`).exec(header);
  return match?.[1] ?? "";
}

/**
 * SHA-256 of the device id, so the stored value cannot be turned back into the cookie.
 *
 * The cookie itself is already opaque and random, so this is belt and braces — but a
 * reporter hash sits beside a description someone typed about a place they were standing
 * in, and that pairing deserves the extra step.
 */
async function hashOf(deviceId: string): Promise<string | null> {
  if (!deviceId) return null;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(deviceId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
