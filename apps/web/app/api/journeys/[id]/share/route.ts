import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { createShare, revokeShares } from "../../../../../lib/share";

/**
 * Minting and revoking a share link (PRD-PREP-004, TRD-SEC-004).
 *
 * Rate-limited on `share_create` (10/day, TRD §6.2). The limit is not about load — it is
 * that a journey with a hundred live tokens cannot meaningfully be un-shared, and a
 * traveler who taps Share repeatedly should not end up in that position by accident.
 *
 * Both halves run on the traveler's own client, so `owns_journey` decides whether a link
 * may be minted at all. Reading a shared summary is the other direction entirely — see
 * `lib/share.ts` and the 0019 migration.
 */
export const POST = withApi({
  schema: z.object({}).optional(),
  requireAuth: true,
  rateLimit: "share_create",
  handler: async ({ request, supabase, user }) => {
    const journeyId = journeyIdFrom(request);

    // RLS decides. A journey the caller does not own yields no row, which is a 404 for
    // the same reason a missing item is: confirming it exists is itself a leak.
    const share = await createShare(supabase, journeyId, user!.id);
    if (!share) throw new ApiError("not_found");

    return share;
  },
});

/**
 * Revoke every live link for this journey.
 *
 * All of them, not one — a traveler tapping "Stop sharing" means the journey stops being
 * shared. Leaving an older token alive because it was not the one on screen is a promise
 * quietly broken.
 */
export const DELETE = withApi({
  schema: z.object({}).optional(),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ request, supabase }) => {
    const journeyId = journeyIdFrom(request);
    return { revoked: await revokeShares(supabase, journeyId) };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
