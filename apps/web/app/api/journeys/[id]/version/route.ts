import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { journeyVersion } from "../../../../../lib/journey-version";

/**
 * `GET /api/journeys/:id/version` — has this journey changed? (PRD-ACCT-005)
 *
 * Two timestamps, read as the traveler, so an open journey can check every few seconds
 * without the cost of reloading the plan. Limited by `journey_sync`, a read budget, rather
 * than `journeys_write`, which a watching tab would otherwise spend in twenty minutes.
 */
export const GET = withApi({
  schema: z.object({}),
  requireAuth: true,
  rateLimit: "journey_sync",
  handler: async ({ request, supabase }) => {
    const journeyId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2) ?? "";

    const version = await journeyVersion(supabase, journeyId);
    // Another traveler's journey is invisible under RLS, so this is 404 rather than 403.
    if (!version) throw new ApiError("not_found");

    return { version };
  },
});
