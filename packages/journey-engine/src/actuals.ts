import type { JourneyItem } from "./types";

/** Items the day has already moved past; their times are history, never shifted. */
const SETTLED = new Set(["done", "skipped", "moved"]);

/**
 * The plan as it now stands, given what actually happened (PRD-LIVE-002).
 *
 * "Running late" and "Done" record `actual_*` times and move nothing in the plan — that is
 * the Change Card's job, behind a tap (PRD Principle 6). But a projection that reads only
 * the planned times answers for a day that is no longer happening: Live kept showing the
 * next item at its old time, the leave-by said to leave while the traveler was still
 * inside, and the health pill stayed Comfortable. So every reader first projects the
 * actuals forward:
 *
 *   - an item whose actual end is later than planned ends then, and its duration counts
 *     what it really took;
 *   - every item still ahead of it that day starts and ends that much later — except a
 *     FIXED item, which happens at its time whether or not the traveler reaches it (the
 *     health checks then say so);
 *   - an item that finished early pulls nothing earlier. The plan said when; being ahead
 *     is room, not a new schedule.
 *
 * Pure and idempotent: projecting a projection changes nothing, so a caller that projects
 * and hands the result to another reader that projects again gets the same day.
 */
export function projectActuals(items: JourneyItem[]): JourneyItem[] {
  if (!items.some((i) => i.actual_end_at)) return items;

  const byDay = new Map<number, JourneyItem[]>();
  for (const item of items) {
    byDay.set(item.day_index, [...(byDay.get(item.day_index) ?? []), item]);
  }

  const projected = new Map<string, JourneyItem>();

  for (const day of byDay.values()) {
    let carry = 0;

    for (const item of [...day].sort((a, b) => a.sort_order - b.sort_order)) {
      const actualEnd = parse(item.actual_end_at);
      const plannedEnd = parse(item.planned_end_at);

      if (actualEnd !== null) {
        // Reality resets the carry: what is late now is measured from this item's real end.
        carry = plannedEnd !== null ? Math.max(0, actualEnd - plannedEnd) : 0;
        projected.set(item.id, {
          ...item,
          ...(carry > 0 ? { planned_end_at: new Date(actualEnd).toISOString() } : {}),
          duration_likely_minutes: tookMinutes(item, actualEnd),
        });
        continue;
      }

      const movable = carry > 0 && !SETTLED.has(item.status ?? "planned") && item.tier !== "fixed";

      projected.set(
        item.id,
        movable
          ? {
              ...item,
              planned_start_at: shifted(item.planned_start_at, carry),
              planned_end_at: shifted(item.planned_end_at, carry),
            }
          : item,
      );
    }
  }

  return items.map((item) => projected.get(item.id) ?? item);
}

/** What the item really took, when that is longer than the plan allowed. */
function tookMinutes(item: JourneyItem, actualEnd: number): number | null {
  const start = parse(item.actual_start_at) ?? parse(item.planned_start_at);
  if (start === null) return item.duration_likely_minutes ?? null;
  const took = Math.round((actualEnd - start) / 60_000);
  return Math.max(item.duration_likely_minutes ?? 0, took);
}

function shifted(instant: string | null | undefined, ms: number): string | null {
  const at = parse(instant);
  return at === null ? (instant ?? null) : new Date(at + ms).toISOString();
}

function parse(instant: string | null | undefined): number | null {
  if (!instant) return null;
  const at = Date.parse(instant);
  return Number.isNaN(at) ? null : at;
}
