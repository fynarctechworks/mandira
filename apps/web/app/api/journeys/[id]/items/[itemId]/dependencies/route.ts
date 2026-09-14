import { ApiError } from "@mandhira/db/api";
import type { JourneyItemDependency } from "@mandhira/journey-engine";
import { z } from "zod";

import { withApi } from "../../../../../../../lib/api";
import { mustWrite } from "../../../../../../../lib/data-error";
import { getJourney } from "../../../../../../../lib/journeys";
import { resyncNotifications } from "../../../../../../../lib/notifications";
import { rescheduleDays } from "../../../../../../../lib/replan";

/**
 * "Do this after …" (PRD-PLAN-003's item editor, PRD F5 check 3).
 *
 * One "after" per item, chosen from the same day: the scheduler keeps the order and Journey
 * Health says when the plan breaks it. Replacing rather than adding keeps the editor to one
 * question a traveler can answer — what has to happen first — instead of a graph to manage.
 *
 * Refused, with the reason: an item after itself, an item on another day (move it there
 * first), and a choice that would make two items each wait for the other. RLS already
 * limits both ends to the traveler's own items (0008); the day and the journey are checked
 * here because RLS cannot know which journey the screen is about.
 *
 * An explicit tap (PRD Principle 6). The day is rescheduled afterwards so the times follow
 * the new order, and reminders follow the times.
 */
const schema = z.object({ afterItemId: z.string().uuid().nullable() });

export const PUT = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, request, supabase, user }) => {
    const { journeyId, itemId } = idsFrom(request);
    const detail = await getJourney(supabase, journeyId, "en");
    if (!detail) throw new ApiError("not_found");

    const item = detail.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError("not_found");

    if (input.afterItemId !== null) {
      const after = detail.items.find((i) => i.id === input.afterItemId);
      if (!after) throw new ApiError("not_found");
      if (after.id === item.id) {
        throw new ApiError("invalid", "Something can't come after itself.");
      }
      if (after.day_index !== item.day_index) {
        throw new ApiError(
          "invalid",
          "Choose something on the same day. If this belongs on that day, move it there first.",
        );
      }
      const others = detail.dependencies.filter((d) => d.item_id !== item.id);
      if (comesAfter(others, after.id, item.id)) {
        throw new ApiError(
          "invalid",
          "That would make each of them wait for the other. Change the other one first.",
        );
      }
    }

    mustWrite(
      await supabase.from("journey_item_dependencies").delete().eq("item_id", itemId),
      "journey_item_dependencies delete",
    );
    if (input.afterItemId !== null) {
      mustWrite(
        await supabase
          .from("journey_item_dependencies")
          .insert({ item_id: itemId, after_item_id: input.afterItemId }),
        "journey_item_dependencies insert",
      );
    }

    const updated = await rescheduleDays(supabase, journeyId, [item.day_index]);
    await resyncNotifications(
      supabase,
      journeyId,
      user!.id,
      "PUT /api/journeys/:id/items/:itemId/dependencies",
    );
    return { items: updated?.items ?? [], health: updated?.health ?? null };
  },
});

/** Whether `start` already has to happen after `target`, directly or through others. */
function comesAfter(deps: JourneyItemDependency[], start: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const dep of deps) {
      if (dep.item_id !== id || seen.has(dep.after_item_id)) continue;
      if (dep.after_item_id === target) return true;
      seen.add(dep.after_item_id);
      stack.push(dep.after_item_id);
    }
  }
  return false;
}

/** Route params, read from the URL because `withApi` hands the raw request through. */
function idsFrom(request: Request): { journeyId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  // …/journeys/<id>/items/<itemId>/dependencies
  return { itemId: parts.at(-2) ?? "", journeyId: parts.at(-4) ?? "" };
}
