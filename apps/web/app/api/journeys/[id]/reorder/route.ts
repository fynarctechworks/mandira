import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { mustWrite } from "../../../../../lib/data-error";
import { getJourney } from "../../../../../lib/journeys";
import { rescheduleDays } from "../../../../../lib/replan";

/**
 * `POST /api/journeys/:id/reorder` — a new order for one day (TRD §5.2).
 *
 * The order must name every item of the day exactly once; `reorder_journey_items` (0033)
 * refuses anything else in the database too. FIXED items keep their time whatever their
 * position, because the scheduler anchors them — a reorder changes what happens around a
 * fixed time, never the time itself.
 */
const schema = z.object({
  dayIndex: z.number().int().min(0).max(30),
  orderedItemIds: z.array(z.string().uuid()).min(1).max(60),
});

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2) ?? "";

    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const dayIds = detail.items
      .filter((item) => item.day_index === input.dayIndex)
      .map((item) => item.id);
    const ordered = input.orderedItemIds;

    if (
      new Set(ordered).size !== ordered.length ||
      ordered.length !== dayIds.length ||
      !dayIds.every((id) => ordered.includes(id))
    ) {
      throw new ApiError("invalid", "The new order has to include everything on that day, once.");
    }

    const { error } = await supabase.rpc("reorder_journey_items", {
      p_journey_id: journeyId,
      p_day_index: input.dayIndex,
      p_item_ids: ordered,
    });
    mustWrite({ error }, "reorder_journey_items");

    const updated = await rescheduleDays(supabase, journeyId, [input.dayIndex]);
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});
