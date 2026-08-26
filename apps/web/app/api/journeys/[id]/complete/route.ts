import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { completeJourney } from "../../../../../lib/record";

/**
 * Ending a journey (TRD §5 `POST /api/journeys/:id/complete`, PRD F16).
 *
 * A journey becomes complete because the traveler says so, not because its last date
 * slipped into the past — PRD Principle 6 applies to the end of a journey exactly as it
 * applies to every change inside one. The Record is readable long before this is tapped;
 * what the tap adds is that the account of what happened stops moving.
 *
 * Nothing is deleted and nothing is locked. The reflection stays editable, the items stay
 * where they are, and a traveler who taps this on the wrong day has lost nothing.
 */
export const POST = withApi({
  schema: z.object({}).optional(),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    // RLS decides. A journey the caller does not own yields no record at all, which is a
    // 404 for the same reason a missing item is: confirming it exists is itself a leak.
    const record = await completeJourney(supabase, journeyId, "en");
    if (!record) throw new ApiError("not_found");

    return { record };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
