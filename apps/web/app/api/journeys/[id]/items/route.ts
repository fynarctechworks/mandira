import { ApiError } from "@mandhira/db/api";
import { dateForDay, toInstant, toMinutes } from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../../../lib/api";
import { mustMaybe } from "../../../../../lib/data-error";
import { dayCountOf, toEngineJourney } from "../../../../../lib/journey-types";
import { getJourney } from "../../../../../lib/journeys";
import { getKnowledgeBundle } from "../../../../../lib/knowledge";
import { syncJourneyNotifications } from "../../../../../lib/notifications";
import { rescheduleDays } from "../../../../../lib/replan";

/**
 * `POST /api/journeys/:id/items` — add an experience from discovery (TRD §5.2, PRD-DISC-004).
 *
 * The traveler chose the journey, the day and the tier in the sheet; this is that tap. The
 * experience must be PUBLISHED for the journey's own destination — a crafted request cannot
 * add something unpublished, or something from somewhere else. The day is then put back on
 * the clock with real travel in it, and the new health comes back with the items.
 */
const schema = z
  .object({
    experienceId: z.string().uuid(),
    dayIndex: z.number().int().min(0).max(30).default(0),
    // PRD F2: "adds as IMPORTANT by default".
    tier: z.enum(["fixed", "protected", "important", "optional"]).default("important"),
    fixedStartTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time.")
      .optional(),
  })
  .refine((value) => value.tier !== "fixed" || !!value.fixedStartTime, {
    message: "A fixed item needs its time.",
    path: ["fixedStartTime"],
  });

export const POST = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const journeyId = new URL(request.url).pathname.split("/").filter(Boolean).at(-2) ?? "";

    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");
    const { journey, items } = detail;

    if (!journey.destinationId) {
      throw new ApiError("invalid", "This journey doesn't have a destination to add to yet.");
    }

    const knowledge = await getKnowledgeBundle(journey.destinationId, "en");
    const experience = knowledge.experiences.find((entry) => entry.id === input.experienceId);
    if (!experience) {
      throw new ApiError("not_found", "That isn't published for this journey's destination.");
    }

    if (items.some((item) => item.experience_id === input.experienceId)) {
      throw new ApiError("conflict", "That's already in this journey.");
    }

    if (input.dayIndex >= dayCountOf(journey, items)) {
      throw new ApiError("invalid", "This journey doesn't have that day.");
    }

    const place = experience.place_id
      ? knowledge.places.find((entry) => entry.id === experience.place_id)
      : undefined;
    const duration =
      experience.duration_likely_minutes ?? place?.visit_duration_likely_minutes ?? null;

    const sortOrder = items
      .filter((item) => item.day_index === input.dayIndex)
      .reduce((last, item) => Math.max(last, item.sort_order + 1), 0);

    let fixedStartAt: string | null = null;
    let fixedEndAt: string | null = null;
    if (input.tier === "fixed" && input.fixedStartTime) {
      const day = dateForDay(toEngineJourney(journey).start_date, input.dayIndex);
      const start = toMinutes(input.fixedStartTime);
      fixedStartAt = toInstant(day, start, journey.timezone);
      fixedEndAt = duration ? toInstant(day, start + duration, journey.timezone) : null;
    }

    const inserted = mustMaybe(
      await supabase
        .from("journey_items")
        .insert({
          journey_id: journeyId,
          day_index: input.dayIndex,
          sort_order: sortOrder,
          item_type: "experience",
          tier: input.tier,
          experience_id: experience.id,
          place_id: experience.place_id ?? null,
          duration_likely_minutes: duration,
          duration_max_minutes: experience.duration_max_minutes ?? null,
          fixed_start_at: fixedStartAt,
          fixed_end_at: fixedEndAt,
        })
        .select("id")
        .maybeSingle(),
      "journey_items insert",
    );

    const updated = await rescheduleDays(supabase, journeyId, [input.dayIndex]);

    // A reminder that failed to queue must not turn a saved item into a failed request.
    await syncJourneyNotifications(supabase, journeyId, user!.id).catch(() => undefined);

    return {
      itemId: inserted?.id ?? null,
      items: updated?.items ?? [],
      health: updated?.health ?? null,
    };
  },
});
