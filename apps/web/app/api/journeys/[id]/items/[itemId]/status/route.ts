import { ApiError } from "@mandhira/db/api";
import type { Database } from "@mandhira/db/types";
import { z } from "zod";

import { withApi } from "../../../../../../../lib/api";
import { getJourney } from "../../../../../../../lib/journeys";
import { resyncNotifications } from "../../../../../../../lib/notifications";

/**
 * The three Live Journey actions (PRD-LIVE-002): Done, Running late, Stay longer.
 *
 * WHAT THESE DO, AND WHAT THEY DELIBERATELY DO NOT.
 *
 * "Running late" and "stay longer" mean the plan no longer matches reality. The obvious
 * implementation is to reschedule the rest of the day. That is forbidden: PRD Principle 6
 * allows no state-changing journey action without an explicit tap on THAT change, and PRD
 * F6 routes every plan change through a Change Card the traveler accepts.
 *
 * So these record what actually happened — `status` and the `actual_*` timestamps — and
 * nothing else moves. The day then re-projects from the truth, so the health pill drops
 * and the leave-by shifts, which is a real and useful answer. Offering to FIX it is the
 * Change Card, B-026, where `evaluateChange` is already waiting.
 *
 * A traveler who taps "Running late" and watches their day go from Comfortable to Tight
 * has learned something true. What they cannot do yet is tap "fix it".
 */
const schema = z.object({
  action: z.enum(["done", "running_late", "stay_longer", "reopen"]),
  /**
   * How much longer, for the two actions that mean "more time than planned".
   *
   * Bounded at four hours: past that the traveler is not running late, they have changed
   * their day, and the honest move is to edit the plan rather than stretch one item.
   */
  extraMinutes: z.number().int().min(5).max(240).optional(),
  /**
   * When the traveler tapped it, for an action replayed from the offline outbox
   * (PRD-OFFL-004). "Done" at 7:10 on a hillside that reaches us at 11:00 finished at 7:10.
   */
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

/** How far back a replayed tap is believed; older than this, the server's clock is used. */
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const { journeyId, itemId } = idsFrom(request);

    // RLS means another traveler's item is not visible at all, so a mismatch is a 404
    // rather than a 403 — confirming it exists would itself be a leak.
    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const item = detail.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError("not_found");

    const now = whenItHappened(input.occurredAt);
    const patch: Database["public"]["Tables"]["journey_items"]["Update"] = {};

    switch (input.action) {
      case "done":
        patch.status = "done";
        patch.actual_end_at = now;
        // Backfills a start for something the traveler never explicitly began. Without it
        // an item marked done carries an end and no beginning, which reads as corrupt data
        // later rather than as "they just got on with it".
        patch.actual_start_at = item.planned_start_at ?? now;
        break;

      case "running_late":
      case "stay_longer":
        /*
         * Both mean "this is taking longer than planned", and both are recorded the same
         * way — as an ACTUAL end later than the planned one. The difference between them
         * is why, not what, and why is not something the schedule can act on.
         */
        patch.status = "in_progress";
        patch.actual_start_at = item.actual_start_at ?? item.planned_start_at ?? now;
        patch.actual_end_at = shiftedEnd(
          item.planned_end_at ?? null,
          now,
          input.extraMinutes ?? 15,
        );
        break;

      case "reopen":
        // Undo. A traveler who taps Done on the wrong card in a queue at 5am should be one
        // tap from putting it back, not stuck with a day that has quietly moved on.
        patch.status = "planned";
        patch.actual_end_at = null;
        break;
    }

    const { error } = await supabase
      .from("journey_items")
      .update(patch)
      .eq("id", itemId)
      .eq("journey_id", journeyId);

    if (error) throw error;

    // Fresh items AND fresh health, for the same reason every other mutation returns both:
    // a screen showing yesterday's verdict on today's plan is the failure this guards.
    // A done or skipped item needs no leave-by; one running late moves what follows.
    await resyncNotifications(
      supabase,
      journeyId,
      user!.id,
      "PATCH /api/journeys/:id/items/:itemId/status",
    );
    const updated = await getJourney(supabase, journeyId, "en");
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});

/**
 * A new end time: whichever is later of the planned end or now, plus the extra.
 *
 * Anchored to `now` when the item has already overrun, because adding fifteen minutes to
 * an end time that passed half an hour ago produces a deadline in the past — and a NOW
 * card counting down to a moment that has been and gone is worse than no countdown.
 */
function shiftedEnd(plannedEnd: string | null, now: string, extraMinutes: number): string {
  const base = Math.max(Date.parse(plannedEnd ?? now), Date.parse(now));
  return new Date(base + extraMinutes * 60_000).toISOString();
}

/**
 * The moment the action happened: the device's own time for a replayed tap, when that is
 * believable — not in the future (beyond a little clock drift) and not older than a week.
 */
function whenItHappened(occurredAt: string | undefined): string {
  const serverNow = Date.now();
  const at = occurredAt ? Date.parse(occurredAt) : Number.NaN;
  const believable = at <= serverNow + 2 * 60_000 && at >= serverNow - REPLAY_WINDOW_MS;
  return new Date(believable ? Math.min(at, serverNow) : serverNow).toISOString();
}

/** Route params, read from the URL because `withApi` hands the raw request through. */
function idsFrom(request: Request): { journeyId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  // …/journeys/<id>/items/<itemId>/status
  return { itemId: parts.at(-2) ?? "", journeyId: parts.at(-4) ?? "" };
}
