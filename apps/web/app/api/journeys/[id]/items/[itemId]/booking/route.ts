import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../../../lib/api";
import { getJourney } from "../../../../../../../lib/journeys";

/**
 * Booked-slot promotion (PRD-PREP-003, PRD F7).
 *
 * A traveler books a slot and enters the time they were given. That time is not a
 * preference any more — it is a commitment with a ticket behind it — so the item becomes
 * FIXED, and the return guard and the option ladder both start treating it as immovable.
 *
 * WHY THIS IS ITS OWN ROUTE rather than a tier change on the item route. Promotion is two
 * facts arriving together: the time, and the reason it cannot move. Sending them
 * separately would leave a window where an item is FIXED at whatever time it happened to
 * be scheduled for — which is a fixed commitment to the wrong moment, and worse than none.
 *
 * PRD Principle 6 still applies: this is an explicit tap, with the consequence stated
 * before it. Nothing infers a booking from anything.
 */
const schema = z.object({
  /** The slot the traveler was actually given, as an instant. */
  bookedAt: z.string().datetime({ offset: true }),
  bookedEndAt: z.string().datetime({ offset: true }).optional(),
  /**
   * PRD-PREP-003 promotes WITH CONFIRMATION. A client that omits this is refused rather
   * than assumed to have asked — the same rule as every other destructive-ish action.
   */
  confirmed: z.literal(true),
});

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const { journeyId, itemId } = idsFrom(request);

    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const item = detail.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError("not_found");

    if (input.bookedEndAt && Date.parse(input.bookedEndAt) <= Date.parse(input.bookedAt)) {
      throw new ApiError("invalid", "The end of the slot needs to be after its start.");
    }

    /*
     * `fixed_start_at` is what makes the tier mean anything. Without it the item is FIXED
     * with nothing to be fixed TO — the return guard loses its anchor and the ladder
     * refuses to move something that has no time (B-019 learned this the hard way, D-095).
     */
    const { error } = await supabase
      .from("journey_items")
      .update({
        tier: "fixed",
        fixed_start_at: input.bookedAt,
        fixed_end_at: input.bookedEndAt ?? null,
        // The plan follows the booking, not the other way round.
        planned_start_at: input.bookedAt,
        ...(input.bookedEndAt ? { planned_end_at: input.bookedEndAt } : {}),
      })
      .eq("id", itemId)
      .eq("journey_id", journeyId);

    if (error) throw error;

    // Fresh items AND fresh health: promoting something to FIXED can turn a comfortable
    // day tight, and that is exactly what the traveler needs to see next.
    const updated = await getJourney(supabase, journeyId, "en");
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function idsFrom(request: Request): { journeyId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  // …/journeys/<id>/items/<itemId>/booking
  return { itemId: parts.at(-2) ?? "", journeyId: parts.at(-4) ?? "" };
}
