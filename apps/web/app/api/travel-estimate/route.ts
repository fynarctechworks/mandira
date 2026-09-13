import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../lib/api";
import { mustList } from "../../../lib/data-error";
import { ensureTravelEstimates, readTravelEstimate } from "../../../lib/travel";

/**
 * `GET /api/travel-estimate` — one cached leg (TRD §5.2, INTEGRATIONS).
 *
 * Routes the leg first when the cache has nothing fresh, then answers from the cache with the
 * provider it came from. Signed in only: every miss spends routing quota, and a guest's
 * session cookie is too cheap to replace to be the only thing standing in front of it.
 */
const schema = z
  .object({
    fromPlaceId: z.string().uuid(),
    toPlaceId: z.string().uuid(),
    mode: z.enum(["walk", "vehicle", "public_transport", "hired", "other"]).default("walk"),
  })
  .refine((value) => value.fromPlaceId !== value.toPlaceId, {
    message: "Choose two different places.",
    path: ["toPlaceId"],
  });

export const GET = withApi({
  schema,
  requireAuth: true,
  rateLimit: "travel_estimate",
  handler: async ({ input, supabase }) => {
    // Checked as the traveler, so an unpublished place is never routed or revealed.
    const published = mustList(
      await supabase
        .from("v_published_places")
        .select("id")
        .in("id", [input.fromPlaceId, input.toPlaceId]),
      "v_published_places",
    );
    if (published.length < 2) throw new ApiError("not_found");

    const leg = { from: input.fromPlaceId, to: input.toPlaceId };
    await ensureTravelEstimates([leg], { modes: [input.mode] });

    const cached = await readTravelEstimate(leg, input.mode);
    if (!cached) {
      throw new ApiError("not_found", "There's no travel time between those places yet.");
    }
    return cached;
  },
});
