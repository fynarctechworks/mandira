import type { Database } from "@mandhira/db/types";
import type { JourneyItem } from "@mandhira/journey-engine";

/**
 * The journey types and the pure helpers over them.
 *
 * SEPARATE from `journeys.ts` for one reason, and it is the reason D-086 exists: that
 * module imports `getKnowledgeBundle`, which imports the Supabase server client, which
 * imports `next/headers`. Any client component that reached for `toEngineJourney` — even
 * only for a TYPE beside it — dragged the whole chain into the browser bundle and failed
 * the build with a message that names none of the files responsible.
 *
 * B-023 hit it exactly: the offline Live view runs in the browser and needs both the types
 * and the conversion. Nothing here may import anything that touches a request.
 */
export type StoredJourney = {
  id: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  dayStartTime: string;
  dayEndTime: string;
  pace: Database["public"]["Enums"]["pace_enum"];
  status: Database["public"]["Enums"]["journey_status_enum"];
  destinationId: string | null;
  /** When this journey was last compared against published knowledge (PRD-OPS-WF-007). */
  knowledgeCheckedAt: string | null;
  /**
   * The engine's latest verdict on the whole journey, as last stored. Read by lists that
   * cannot afford to run the engine per card; kept current by `getJourney`, which writes
   * it back whenever the verdict changes.
   */
  healthState: Database["public"]["Enums"]["health_state_enum"] | null;
};

/**
 * A stored item is the engine's item PLUS what the Live Journey records about it.
 *
 * Deliberately widened here rather than in the engine. `status` and the `actual_*`
 * timestamps say what HAPPENED; the engine's `JourneyItem` says what is planned, and it
 * schedules from the plan. Adding fields the engine ignores to its own contract would
 * invite something to start scheduling from them.
 *
 * Structurally assignable to `JourneyItem`, so these pass straight into the engine.
 */
export type StoredItem = JourneyItem & {
  status: "planned" | "in_progress" | "done" | "skipped" | "moved";
  actual_start_at: string | null;
  actual_end_at: string | null;
  /** The traveler's own note on the item (PRD-PLAN-003). */
  note?: string | null;
};

/**
 * The engine's view of a stored journey.
 *
 * A journey with no dates cannot be scheduled, so it falls back to today rather than
 * throwing — the traveler is mid-edit, not in an invalid state, and a screen that refuses
 * to render because a date is missing is a screen that punishes them for it.
 */
/** Days the journey spans: its dates when it has both, otherwise as far as its items reach. */
export function dayCountOf(
  journey: Pick<StoredJourney, "startDate" | "endDate">,
  items: readonly { day_index: number }[],
): number {
  if (journey.startDate && journey.endDate) {
    const span = Math.round(
      (Date.parse(journey.endDate) - Date.parse(journey.startDate)) / 86_400_000,
    );
    return Math.max(1, span + 1);
  }
  return Math.max(1, ...items.map((item) => item.day_index + 1));
}

export function toEngineJourney(journey: StoredJourney) {
  return {
    id: journey.id,
    start_date: journey.startDate ?? new Date().toISOString().slice(0, 10),
    end_date: journey.endDate,
    timezone: journey.timezone,
    day_start_time: journey.dayStartTime,
    day_end_time: journey.dayEndTime,
  };
}
