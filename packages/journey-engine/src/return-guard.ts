import { travelMinutes } from "./schedule";
import { dateForDay, fromInstant, toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";

export type ReturnGuardResult = {
  ok: boolean;
  /** When the traveler must leave the preceding item to make the anchor. */
  requiredDepartureAt: string | null;
  /** How badly the current plan misses it. 0 when it holds. */
  breachMinutes: number;
  /** The FIXED item being protected, if there is one. */
  anchorItemId: string | null;
};

/**
 * The return guard (PRD-PLAN-006, TRD §5.1 `checkReturnGuard`).
 *
 * The last FIXED item of a journey — the train home, the flight, the booked seva slot — is
 * the one thing a plan may never break. This works backwards from it: given where the
 * traveler will be beforehand, when must they leave to still make it?
 *
 * A breach is reported, never fixed. PRD F5 makes a breached return `Broken` health, and
 * what to give up is the traveler's decision through a Change Card, not the engine's.
 */
export function checkReturnGuard(input: {
  journey: Journey;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  /** Minutes to allow between arriving and the anchor. Boarding is not instantaneous. */
  arrivalBufferMinutes?: number;
}): ReturnGuardResult {
  const { journey, items, knowledge } = input;
  const arrivalBuffer = input.arrivalBufferMinutes ?? 0;

  const anchors = items
    .filter((item) => item.tier === "fixed" && item.fixed_start_at)
    .sort((a, b) => Date.parse(a.fixed_start_at!) - Date.parse(b.fixed_start_at!));

  const anchor = anchors.at(-1);
  if (!anchor) {
    // No fixed anchor is not a failure — many journeys have none. There is simply
    // nothing to guard.
    return { ok: true, requiredDepartureAt: null, breachMinutes: 0, anchorItemId: null };
  }

  const date = dateForDay(journey.start_date, anchor.day_index);
  const anchorMinutes = fromInstant(anchor.fixed_start_at!, date, journey.timezone);

  /*
   * The last thing that STARTS before the anchor, wherever it sits in the journey.
   *
   * Selected on its start, not its end. An earlier version filtered to items ending at or
   * before the anchor, which silently excluded the worst case there is: something that
   * begins before the return and runs PAST it. That plan has no preceding item by the old
   * test, so the guard reported `ok` on the one shape it exists to catch — and the day
   * read as Comfortable while the traveler missed their train.
   */
  const anchorStart = Date.parse(anchor.fixed_start_at!);

  const preceding = items
    .filter((item) => item.id !== anchor.id && item.planned_end_at)
    // Falls back to the end instant for an item with no recorded start, so a partially
    // scheduled item is still weighed rather than silently skipped.
    .filter((item) => Date.parse(item.planned_start_at ?? item.planned_end_at!) < anchorStart)
    .sort((a, b) => Date.parse(a.planned_end_at!) - Date.parse(b.planned_end_at!))
    .at(-1);

  if (!preceding) {
    return {
      ok: true,
      requiredDepartureAt: null,
      breachMinutes: 0,
      anchorItemId: anchor.id,
    };
  }

  const travel = travelMinutes(preceding, anchor, knowledge);
  const buffer = preceding.buffer_minutes ?? 0;

  const latestDeparture = anchorMinutes - travel - buffer - arrivalBuffer;
  const actualDeparture = fromInstant(preceding.planned_end_at!, date, journey.timezone);
  const breach = Math.max(0, actualDeparture - latestDeparture);

  return {
    ok: breach === 0,
    requiredDepartureAt: toInstant(date, latestDeparture, journey.timezone),
    breachMinutes: breach,
    anchorItemId: anchor.id,
  };
}
