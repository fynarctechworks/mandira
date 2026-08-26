import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { evaluateTrigger } from "../../../../../lib/changes";

/**
 * Evaluate a trigger and hand back a Change Card (PRD F6, PRD-ADPT-001/004).
 *
 * This route CHANGES NOTHING. It is the half of adaptive replanning that looks at what
 * happened and works out what could be done — the plan moves only when the traveler taps
 * an option, which is a separate call (PRD-ADPT-005, PRD Principle 6).
 *
 * That split is the feature, not an implementation detail. A single endpoint that
 * evaluated and applied would make "show me my options" indistinguishable from "do it",
 * and the whole product rests on those being different things.
 */
const schema = z.object({
  kind: z.enum([
    "user_late",
    "user_done_delta",
    "user_stay_longer",
    "knowledge_update",
    "live_transport",
    "live_weather",
    "item_added",
    "item_removed",
    "preferences_changed",
    "availability_changed",
  ]),
  dayIndex: z.number().int().min(0).max(30),
  itemId: z.string().uuid().optional(),
  /**
   * Minutes lost (positive) or gained (negative).
   *
   * Bounded at four hours in either direction, for the same reason the Live status route
   * is: past that the traveler has not run late, they have changed their day, and the
   * honest response is to edit the plan rather than absorb it as a delay.
   */
  deltaMinutes: z.number().int().min(-240).max(240).optional(),
});

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase }) => {
    const journeyId = journeyIdFrom(request);

    const event = await evaluateTrigger(
      supabase,
      journeyId,
      {
        kind: input.kind,
        dayIndex: input.dayIndex,
        ...(input.itemId ? { itemId: input.itemId } : {}),
        ...(input.deltaMinutes !== undefined ? { deltaMinutes: input.deltaMinutes } : {}),
      },
      "en",
    );

    // RLS means another traveler's journey is not visible, so this is a 404 rather than a
    // 403 — confirming it exists would itself be a leak.
    if (!event) throw new ApiError("not_found");

    return event;
  },
});

/** Route params, read from the URL because `withApi` hands the raw request through. */
function journeyIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}
