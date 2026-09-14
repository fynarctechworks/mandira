import { scheduleDay } from "@mandhira/journey-engine";

import { travelersFor } from "./changes";
import { mustWrite } from "./data-error";
import { getJourney, toEngineJourney, type JourneyDetail } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";
import { planWithTravel } from "./travel";

type Client = Awaited<ReturnType<typeof webSupabase>>;

/** What already happened keeps the times it happened at; only the plan ahead is moved. */
const SETTLED = new Set(["done", "in_progress", "skipped"]);

/**
 * Puts the given days back on the clock after a structural edit — an item added, a day
 * reordered, the day's hours changed — with real travel between places (INTEGRATIONS).
 *
 * Only `planned_start_at` / `planned_end_at` are written, and only where they moved. The
 * scheduler never drops or reorders anything (TRD §5.1), so this cannot change WHAT is
 * planned, only WHEN — which is why it may follow an edit the traveler already tapped.
 */
export async function rescheduleDays(
  supabase: Client,
  journeyId: string,
  dayIndexes: readonly number[] | "all",
  locale = "en",
): Promise<JourneyDetail | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items } = detail;
  const destinationId = journey.destinationId;
  if (!destinationId || items.length === 0) return detail;

  const days =
    dayIndexes === "all" ? [...new Set(items.map((i) => i.day_index))] : [...new Set(dayIndexes)];
  const travelers = await travelersFor(supabase, journeyId);
  const engineJourney = toEngineJourney(journey);

  const { result } = await planWithTravel({
    load: () => getKnowledgeBundle(destinationId, locale),
    plan: (knowledge) => ({
      items: days.flatMap(
        (dayIndex) =>
          scheduleDay({
            journey: engineJourney,
            dayIndex,
            items,
            knowledge,
            travelers,
            dependencies: detail.dependencies,
          }).items,
      ),
    }),
  });

  const stored = new Map(items.map((item) => [item.id, item]));
  const moved = result.items.filter((scheduled) => {
    const current = stored.get(scheduled.id);
    return (
      !!current &&
      !SETTLED.has(current.status) &&
      (!sameInstant(current.planned_start_at, scheduled.planned_start_at) ||
        !sameInstant(current.planned_end_at, scheduled.planned_end_at))
    );
  });

  for (const item of moved) {
    mustWrite(
      await supabase
        .from("journey_items")
        .update({
          planned_start_at: item.planned_start_at ?? null,
          planned_end_at: item.planned_end_at ?? null,
        })
        .eq("id", item.id)
        .eq("journey_id", journeyId),
      "journey_items update",
    );
  }

  return moved.length > 0 ? getJourney(supabase, journeyId, locale) : detail;
}

/** Postgres and the engine write the same instant with different offsets. */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
}
