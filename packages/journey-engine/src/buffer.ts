import type { TravelerProfile } from "./types";

/** PRD-PLAN-005: 15 minutes between items, before any traveler adjustment. */
export const BASE_BUFFER_MINUTES = 15;

/**
 * Buffer between two items (TRD §5.1 `computeBuffer`, PRD-PLAN-005).
 *
 * ×1.5 if anyone is a senior or has limited walking; ×2 for a wheelchair user or someone
 * who needs frequent rest. The LARGEST applicable multiplier wins, because a group moves
 * at the pace of whoever needs the most time — averaging would produce a buffer that suits
 * nobody in it.
 *
 * The result is visible and editable in the builder (PRD-PLAN-005); this is the starting
 * point, not a verdict.
 */
export function computeBuffer(input: {
  baseMinutes?: number;
  travelers: TravelerProfile[];
}): number {
  const base = input.baseMinutes ?? BASE_BUFFER_MINUTES;

  const multiplier = input.travelers.reduce((highest, traveler) => {
    return Math.max(highest, multiplierFor(traveler));
  }, 1);

  // Rounded up: half a minute of buffer is not a real thing, and rounding down would
  // shave time from the person who needed it.
  return Math.ceil(base * multiplier);
}

function multiplierFor(traveler: TravelerProfile): number {
  if (traveler.mobility === "wheelchair" || traveler.mobility === "needs_rest_frequently") {
    return 2;
  }
  if (traveler.mobility === "limited_walking" || traveler.age_band === "senior") {
    return 1.5;
  }
  return 1;
}
