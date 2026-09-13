import { ApiError } from "@mandhira/db/api";
import {
  buildInitialJourney,
  type BuildResult,
  type JourneyBrief,
  type KnowledgeBundle,
} from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../lib/api";
import { getKnowledgeBundle } from "../../../lib/knowledge";
import { syncJourneyNotifications } from "../../../lib/notifications";
import { planWithTravel } from "../../../lib/travel";

/**
 * `POST /api/journeys` — create a journey from a brief (TRD §5.2).
 *
 * Runs `buildInitialJourney` SERVER-SIDE and persists the result through `create_journey`
 * (0031), which writes every row in one transaction as the signed-in traveler. The same pure
 * function the preview screen uses, so a saved journey and its preview cannot differ.
 *
 * Signed in only: guest drafts are device-local (D-093).
 */
const briefSchema = z.object({
  destinationId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date."),
  dayCount: z.number().int().min(1).max(14),
  pace: z.enum(["relaxed", "balanced", "full"]).optional(),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  mustDo: z.array(z.string().uuid()).max(50).default([]),
  wouldLike: z.array(z.string().uuid()).max(50).default([]),
  /*
   * FIXED commitments — the train home, a booked slot (PRD F4, PRD-PLAN-006). These are what
   * the return guard anchors on.
   */
  fixedCommitments: z
    .array(
      z.object({
        at: z.string().datetime({ offset: true }),
        endAt: z.string().datetime({ offset: true }).optional(),
      }),
    )
    .max(20)
    .default([]),
  travelers: z
    .array(
      z.object({
        label: z.string().max(60).optional(),
        mobility: z.enum(["full", "limited_walking", "wheelchair", "needs_rest_frequently"]),
        ageBand: z.enum(["child", "adult", "senior"]),
      }),
    )
    // PRD-PLAN-010: 1–12 travelers.
    .min(1)
    .max(12),
});

export const POST = withApi({
  schema: briefSchema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase }) => {
    const knowledge = await getKnowledgeBundle(input.destinationId, "en");

    /*
     * The brief is filtered to experiences that are actually published, so a saved journey
     * never contains an item pointing at something a traveler cannot see.
     */
    const published = new Set(knowledge.experiences.map((e) => e.id));
    const mustDo = input.mustDo.filter((id) => published.has(id));
    const wouldLike = input.wouldLike.filter((id) => published.has(id));

    if (mustDo.length === 0 && wouldLike.length === 0) {
      throw new ApiError(
        "invalid",
        "Choose at least one thing to do, so there is something to plan around.",
      );
    }

    const brief: JourneyBrief = {
      destination_id: input.destinationId,
      start_date: input.startDate,
      day_count: input.dayCount,
      timezone: input.timezone,
      ...(input.pace ? { pace: input.pace } : {}),
      must_do: mustDo.map((id) => ({ experience_id: id })),
      would_like: wouldLike.map((id) => ({ experience_id: id })),
      fixed_commitments: input.fixedCommitments.map((c) => ({
        at: c.at,
        ...(c.endAt ? { end_at: c.endAt } : {}),
      })),
    };

    const travelers = input.travelers.map((t, index) => ({
      id: `t${index}`,
      mobility: t.mobility,
      age_band: t.ageBand,
    }));

    // Route the legs this plan walks, then plan again with real travel in it.
    const { result: built } = await planWithTravel({
      knowledge,
      load: () => getKnowledgeBundle(input.destinationId, "en"),
      plan: (bundle: KnowledgeBundle): BuildResult =>
        buildInitialJourney({ brief, knowledge: bundle, travelers }),
    });

    const { data: journeyId, error } = await supabase.rpc("create_journey", {
      p_journey: {
        start_date: built.journey.start_date,
        end_date: built.journey.end_date ?? null,
        timezone: built.journey.timezone,
        day_start_time: built.journey.day_start_time,
        day_end_time: built.journey.day_end_time,
        pace: input.pace ?? null,
        brief,
        destination_ids: [input.destinationId],
        travelers: input.travelers.map((t, index) => ({
          label: t.label ?? null,
          mobility: t.mobility,
          age_band: t.ageBand,
          is_self: index === 0,
        })),
        // The engine's ids are build-local (`bi-1`); the database assigns its own.
        items: built.items.map((item) => ({
          day_index: item.day_index,
          sort_order: item.sort_order,
          item_type: item.item_type,
          tier: item.tier,
          experience_id: item.experience_id ?? null,
          place_id: item.place_id ?? null,
          fixed_start_at: item.fixed_start_at ?? null,
          fixed_end_at: item.fixed_end_at ?? null,
          preferred_window_start: item.preferred_window_start ?? null,
          preferred_window_end: item.preferred_window_end ?? null,
          planned_start_at: item.planned_start_at ?? null,
          planned_end_at: item.planned_end_at ?? null,
          duration_likely_minutes: item.duration_likely_minutes ?? null,
          buffer_minutes: item.buffer_minutes ?? null,
        })),
      },
    });

    if (error) throw error;
    if (!journeyId) throw new ApiError("failed");

    const { data: auth } = await supabase.auth.getUser();

    /*
     * Queue the journey's reminders (PRD F15). A reminder that failed to queue must not turn
     * a saved journey into a failed request; the next edit re-runs it idempotently.
     */
    if (auth.user) {
      await syncJourneyNotifications(supabase, journeyId, auth.user.id, "en").catch(
        () => undefined,
      );
    }

    return { journeyId, health: built.health };
  },
});
