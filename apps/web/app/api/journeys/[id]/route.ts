import { ApiError } from "@mandhira/db/api";
import type { Database } from "@mandhira/db/types";
import { dateForDay } from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../../lib/api";
import { mustWrite } from "../../../../lib/data-error";
import { getJourney } from "../../../../lib/journeys";
import { syncJourneyNotifications } from "../../../../lib/notifications";
import { rescheduleDays } from "../../../../lib/replan";

/**
 * `PATCH /api/journeys/:id` — the journey's own details (TRD §5.2).
 *
 * Title, pace, the hours of the day and the dates. Anything that moves the clock puts every
 * day back on it, so the timeline and Journey Health answer for the journey as it now is.
 * Ownership is RLS: another traveler's journey is not visible, so it is a 404.
 */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/** `POST /api/journeys` accepts up to fourteen days; an edit may not exceed what creation allows. */
const MAX_DAYS = 14;

const schema = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    pace: z.enum(["relaxed", "balanced", "full"]).optional(),
    dayStartTime: time.optional(),
    dayEndTime: time.optional(),
    startDate: date.optional(),
    endDate: date.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nothing to change.",
  });

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const journeyId = new URL(request.url).pathname.split("/").filter(Boolean).at(-1) ?? "";

    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");
    const { journey, items } = detail;

    const dayStart = input.dayStartTime ?? journey.dayStartTime;
    const dayEnd = input.dayEndTime ?? journey.dayEndTime;
    if (dayStart >= dayEnd) throw new ApiError("invalid", "The day has to end after it starts.");

    const startDate = input.startDate ?? journey.startDate;
    let endDate = input.endDate ?? journey.endDate;

    // Moving only the first day keeps the journey the same length, which is what "move it" means.
    if (input.startDate && input.endDate === undefined && journey.startDate && journey.endDate) {
      endDate = dateForDay(input.startDate, daysBetween(journey.startDate, journey.endDate));
    }

    if (startDate && endDate) {
      if (endDate < startDate) {
        throw new ApiError("invalid", "The last day can't be before the first.");
      }
      const dayCount = daysBetween(startDate, endDate) + 1;
      if (dayCount > MAX_DAYS) {
        throw new ApiError("invalid", `A journey can be up to ${MAX_DAYS} days.`);
      }
      if (items.some((item) => item.day_index >= dayCount)) {
        throw new ApiError("conflict", "Move or remove what's planned on the later days first.");
      }
    }

    const patch: Database["public"]["Tables"]["journeys"]["Update"] = {};
    if (input.title !== undefined) patch.title = input.title || null;
    if (input.pace !== undefined) patch.pace = input.pace;
    if (input.dayStartTime !== undefined) patch.day_start_time = input.dayStartTime;
    if (input.dayEndTime !== undefined) patch.day_end_time = input.dayEndTime;
    if (input.startDate !== undefined || input.endDate !== undefined) {
      patch.start_date = startDate;
      patch.end_date = endDate;
    }

    mustWrite(await supabase.from("journeys").update(patch).eq("id", journeyId), "journeys update");

    const movesTheClock =
      input.dayStartTime !== undefined ||
      input.dayEndTime !== undefined ||
      input.startDate !== undefined ||
      input.endDate !== undefined;

    const updated = movesTheClock
      ? await rescheduleDays(supabase, journeyId, "all")
      : await getJourney(supabase, journeyId, "en");

    if (movesTheClock) {
      // A reminder that failed to queue must not undo a saved edit; the next edit re-runs it.
      await syncJourneyNotifications(supabase, journeyId, user!.id, "en").catch(() => undefined);
    }

    return { journey: updated?.journey ?? null, health: updated?.health ?? null };
  },
});

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
