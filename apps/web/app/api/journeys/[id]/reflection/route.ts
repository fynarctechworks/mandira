import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { getJourney } from "../../../../../lib/journeys";
import { saveReflection } from "../../../../../lib/record";

/**
 * A traveler's private reflection (PRD F16, PRD-CMPL-002).
 *
 * `journey_records` is owner-only with no Ops policy at all, which is the point: these are
 * three open questions somebody answered about their own pilgrimage. Nothing here is
 * analysed, ranked, aggregated, or fed to a model. It is not product feedback and it is
 * not a review — it is a private note the traveler can come back to.
 *
 * The third answer is the only one that can go anywhere, and only if they separately tap
 * to turn it into a report (PRD F14). Reflecting is not reporting, and this route will
 * never make that decision on their behalf.
 */
const schema = z.object({
  // Generous but bounded. Long enough for a real answer, short enough that this stays a
  // reflection rather than becoming a document.
  most_meaningful: z.string().max(2000).optional(),
  do_differently: z.string().max(2000).optional(),
  got_wrong: z.string().max(2000).optional(),
});

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    // RLS decides; this turns a refusal into an answer.
    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const answers = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
    );

    await saveReflection(supabase, journeyId, answers);
    return { saved: true };
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
