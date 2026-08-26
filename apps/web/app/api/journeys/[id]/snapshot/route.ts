import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { buildSnapshot } from "../../../../../lib/offline/snapshot";

/**
 * Everything one journey needs to survive with no network (PRD-OFFL-001).
 *
 * ONE request, deliberately. The moment this matters is the moment a traveler has one bar
 * on a hillside, and a snapshot assembled from nine round trips is a snapshot that arrives
 * three-quarters written. Assembled server-side and handed over whole, so it either lands
 * or it does not — a half-stored journey is worse than no journey, because it looks
 * complete.
 *
 * Everything in it is read through the traveler's own request-scoped client, so RLS decides
 * what a snapshot may contain exactly as it decides what a screen may show. There is no
 * privileged read here and there must never be one: this payload goes into a database on a
 * device somebody might share.
 */
export const GET = withApi({
  schema: z.object({ locale: z.string().max(8).optional() }),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    const snapshot = await buildSnapshot(supabase, journeyId, input.locale ?? "en");

    // RLS means another traveler's journey is not visible at all, so this is a 404 rather
    // than a 403 — confirming it exists would itself be a leak.
    if (!snapshot) throw new ApiError("not_found");

    return snapshot;
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
