import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../../lib/api";
import { decideChange } from "../../../../../../lib/changes";
import { getJourney } from "../../../../../../lib/journeys";
import { resyncNotifications } from "../../../../../../lib/notifications";

/**
 * The traveler's decision on a Change Card (PRD-ADPT-005).
 *
 * The tap. Nothing in this product rearranges a journey without one, and this is the only
 * route that applies an option — so it is the only place that has to be careful about two
 * things:
 *
 *   1. The option applied is the one the traveler was SHOWN. It is looked up by id in the
 *      persisted card, never recomputed. A recomputation against a journey that moved
 *      underneath them would apply something they never saw.
 *   2. A decision is made once. `decided_at` makes a second POST a no-op rather than
 *      double-moving every item — a double-tap on a slow connection is the normal case,
 *      not the exotic one.
 *
 * "Keep as is" is a real answer and is recorded as one (`optionId: null`). PRD F6 requires
 * it to be offered, and a log that only recorded changes would show a traveler who
 * declined three times as one who was never asked.
 */
const schema = z.object({
  optionId: z.string().max(64).nullable(),
});

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const { journeyId, eventId } = idsFrom(request);

    const result = await decideChange(supabase, journeyId, eventId, input.optionId, "en");

    if (!result) {
      // Unknown event, someone else's, or already decided. All the same answer: there is
      // nothing here to act on.
      throw new ApiError("not_found");
    }

    // Fresh items AND fresh health, like every other mutation — a screen showing the old
    // verdict beside the new plan is the failure this guards against.
    if (result.applied) {
      await resyncNotifications(
        supabase,
        journeyId,
        user!.id,
        "POST /api/journeys/:id/changes/:eventId",
      );
    }
    const updated = await getJourney(supabase, journeyId, "en");

    return {
      outcome: result.outcome,
      applied: result.applied,
      items: updated?.items ?? [],
      health: updated?.health ?? null,
    };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function idsFrom(request: Request): { journeyId: string; eventId: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  // …/journeys/<id>/changes/<eventId>
  return { eventId: parts.at(-1) ?? "", journeyId: parts.at(-3) ?? "" };
}
