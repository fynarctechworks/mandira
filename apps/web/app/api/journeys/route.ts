import { ApiError } from "@mandhira/db/api";
import { buildInitialJourney, type JourneyBrief } from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../lib/api";
import { syncJourneyNotifications } from "../../../lib/notifications";
import { getKnowledgeBundle } from "../../../lib/knowledge";

/**
 * `POST /api/journeys` — create a journey from a brief (TRD §5.2).
 *
 * Runs `buildInitialJourney` SERVER-SIDE once and persists the result, exactly as TRD §5.2
 * specifies. The same pure function the preview screen uses, so a saved journey and the
 * preview it came from cannot differ.
 *
 * Signed in only. `journeys` has no anon policy and AUTHORIZATION_MODEL gives a guest
 * device-local drafts, which is B-023 — so this refuses rather than inventing a
 * server-side guest identity (D-093).
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
   * FIXED commitments — the train home, a booked slot (PRD F4, PRD-PLAN-006).
   *
   * These are what the return guard anchors on. Without one the guard has nothing to
   * protect, which is why the brief collects a return: a journey the engine cannot check
   * you home from is the one case where "Comfortable" means least.
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
  handler: async ({ input, supabase, user }) => {
    const knowledge = await getKnowledgeBundle(input.destinationId, "en");

    /*
     * The brief is filtered to experiences that are actually published. The engine would
     * place an unknown id with no duration and warn about it; refusing here instead means
     * a saved journey never contains an item pointing at something a traveler cannot see.
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

    const built = buildInitialJourney({ brief, knowledge, travelers });

    const { data: journeyRow, error: journeyError } = await supabase
      .from("journeys")
      .insert({
        owner_user_id: user!.id,
        start_date: built.journey.start_date,
        // `?? null`, not the raw value: the engine models an absent end date as
        // undefined and the row type as null, and exactOptionalPropertyTypes keeps those
        // apart on purpose.
        end_date: built.journey.end_date ?? null,
        timezone: built.journey.timezone,
        day_start_time: built.journey.day_start_time,
        day_end_time: built.journey.day_end_time,
        ...(input.pace ? { pace: input.pace } : {}),
      })
      .select("id")
      .single();

    if (journeyError || !journeyRow) throw journeyError ?? new ApiError("failed");
    const journeyId = journeyRow.id;

    await supabase
      .from("journey_destinations")
      .insert({ journey_id: journeyId, destination_id: input.destinationId });

    /*
     * Traveler profiles are the most sensitive rows in the product: owner-only, with no
     * Ops policy at all (PRD-PRIV-002). They are written through the request-scoped client
     * so RLS applies as this traveler, and nothing joins them to anything Ops can read.
     */
    const { data: profiles } = await supabase
      .from("traveler_profiles")
      .insert(
        input.travelers.map((t, index) => ({
          owner_user_id: user!.id,
          label: t.label ?? null,
          mobility: t.mobility,
          age_band: t.ageBand,
          is_self: index === 0,
        })),
      )
      .select("id");

    if (profiles && profiles.length > 0) {
      await supabase
        .from("journey_travelers")
        .insert(profiles.map((p) => ({ journey_id: journeyId, traveler_profile_id: p.id })));
    }

    // The engine's ids are build-local (`bi-1`); the database assigns its own.
    await supabase.from("journey_items").insert(
      built.items.map((item) => ({
        journey_id: journeyId,
        day_index: item.day_index,
        sort_order: item.sort_order,
        item_type: item.item_type,
        tier: item.tier,
        experience_id: item.experience_id ?? null,
        place_id: item.place_id ?? null,
        // Carried through, or the return stops being FIXED the moment it is reloaded and
        // the guard quietly has nothing to anchor on.
        fixed_start_at: item.fixed_start_at ?? null,
        fixed_end_at: item.fixed_end_at ?? null,
        preferred_window_start: item.preferred_window_start ?? null,
        preferred_window_end: item.preferred_window_end ?? null,
        planned_start_at: item.planned_start_at ?? null,
        planned_end_at: item.planned_end_at ?? null,
        duration_likely_minutes: item.duration_likely_minutes ?? null,
        buffer_minutes: item.buffer_minutes ?? 15,
      })),
    );

    /*
     * Queue the journey's reminders (PRD F15, B-027).
     *
     * Here rather than on first opening the Prepare tab, because the reminders that matter
     * most are the ones a traveler would otherwise miss — a booking deadline seven days
     * out reaches someone who saved a journey and closed the app. Idempotent on the
     * engine's dedupe keys, so a later edit re-runs it without queueing anything twice.
     *
     * Deliberately not awaited into the response contract: a reminder that failed to queue
     * must not turn a successfully saved journey into a failed request. It is recorded and
     * the next edit will pick it up.
     */
    await syncJourneyNotifications(supabase, journeyId, user!.id, "en").catch(() => undefined);

    return { journeyId, health: built.health };
  },
});
