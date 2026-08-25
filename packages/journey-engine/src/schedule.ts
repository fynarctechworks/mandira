import { resolveAvailability } from "./availability";
import { computeBuffer } from "./buffer";
import { dateForDay, fromInstant, toInstant, toMinutes } from "./time";
import type {
  IsoDate,
  Journey,
  JourneyItem,
  JourneyItemDependency,
  KnowledgeBundle,
  TravelEstimate,
  TravelerProfile,
  Warning,
} from "./types";

export type ScheduleDayResult = { items: JourneyItem[]; warnings: Warning[] };

/**
 * Places one day's items on the clock (TRD §5.1 `scheduleDay`).
 *
 * Order of authority, highest first:
 *   1. FIXED items — never moved. They are anchors (trains, booked slots, the return).
 *   2. Dependencies — "after X" holds regardless of sort order.
 *   3. Availability windows — an item cannot start before its window opens.
 *   4. Preferred windows the traveler set.
 *   5. Sort order, which is what the traveler dragged.
 *
 * The engine NEVER drops or reorders an item to make things fit. Where something does not
 * fit it is still placed, and a warning says so — deciding what to give up is the
 * traveler's call, made through a Change Card (PRD Principle 6), not a silent edit here.
 */
export function scheduleDay(input: {
  journey: Journey;
  dayIndex: number;
  items: JourneyItem[];
  knowledge: KnowledgeBundle;
  travelers?: TravelerProfile[];
  dependencies?: JourneyItemDependency[];
}): ScheduleDayResult {
  const { journey, dayIndex, knowledge } = input;
  const travelers = input.travelers ?? [];
  const date = dateForDay(journey.start_date, dayIndex);

  const dayStart = toMinutes(journey.day_start_time);
  const dayEnd = toMinutes(journey.day_end_time);
  const buffer = computeBuffer({ travelers });

  const warnings: Warning[] = [];
  const ordered = orderItems(
    input.items.filter((i) => i.day_index === dayIndex),
    input.dependencies ?? [],
    warnings,
  );

  const scheduled: JourneyItem[] = [];
  let cursor = dayStart;
  let previous: JourneyItem | null = null;

  for (const item of ordered) {
    const duration = durationOf(item, knowledge);
    if (duration === null) {
      warnings.push({
        code: "no_duration",
        itemId: item.id,
        message: "No duration recorded, so this could not be placed on the clock.",
      });
      scheduled.push({ ...item, planned_start_at: null, planned_end_at: null });
      continue;
    }

    /*
     * A buffer the traveler set themselves wins over the computed default.
     *
     * PRD F4 says buffers are visible and EDITABLE, so recomputing over an edited one
     * would quietly undo the edit — and it would also make "absorb the delay into your
     * buffers" (PRD F6 ladder step a) impossible to actually carry out, because the
     * absorbed minutes would reappear on the next schedule.
     */
    const effectiveBuffer = item.buffer_minutes ?? buffer;

    // Travel from the previous item, plus the transition buffer.
    if (previous) {
      cursor += travelMinutes(previous, item, knowledge) + effectiveBuffer;
    }

    let start = cursor;

    if (item.tier === "fixed" && item.fixed_start_at) {
      // A FIXED item does not move. If the day has already run past it, that is a real
      // problem the traveler must see rather than something to quietly absorb.
      const anchor = fromInstant(item.fixed_start_at, date, journey.timezone);
      if (anchor < start) {
        warnings.push({
          code: "fixed_overlap",
          itemId: item.id,
          byMinutes: start - anchor,
          message: "Earlier items run past this fixed time.",
        });
      }
      start = anchor;
    } else {
      start = Math.max(start, earliestAllowedStart(item, knowledge, date, warnings));
    }

    const end = start + duration;

    if (end > dayEnd) {
      warnings.push({
        code: "outside_day_window",
        itemId: item.id,
        byMinutes: end - dayEnd,
        message: "This runs past the end of the day.",
      });
    }

    scheduled.push({
      ...item,
      buffer_minutes: previous ? effectiveBuffer : (item.buffer_minutes ?? 0),
      planned_start_at: toInstant(date, start, journey.timezone),
      planned_end_at: toInstant(date, end, journey.timezone),
    });

    cursor = end;
    previous = item;
  }

  return { items: scheduled, warnings };
}

/**
 * Sort order, adjusted so every "after X" dependency holds.
 *
 * A cycle cannot be satisfied by any ordering, so the remaining items are appended in
 * their original order and a warning is raised — refusing to schedule the whole day
 * because two items point at each other would help nobody.
 */
function orderItems(
  items: JourneyItem[],
  dependencies: JourneyItemDependency[],
  warnings: Warning[],
): JourneyItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const blockers = new Map<string, Set<string>>();

  for (const dep of dependencies) {
    if (!byId.has(dep.item_id) || !byId.has(dep.after_item_id)) continue;
    const set = blockers.get(dep.item_id) ?? new Set<string>();
    set.add(dep.after_item_id);
    blockers.set(dep.item_id, set);
  }

  const remaining = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const placed: JourneyItem[] = [];
  const done = new Set<string>();

  while (remaining.length > 0) {
    const index = remaining.findIndex((item) =>
      [...(blockers.get(item.id) ?? [])].every((id) => done.has(id)),
    );

    if (index === -1) {
      for (const item of remaining) {
        warnings.push({
          code: "dependency_cycle",
          itemId: item.id,
          message: "These items depend on each other, so their order could not be resolved.",
        });
      }
      placed.push(...remaining);
      break;
    }

    const [next] = remaining.splice(index, 1);
    placed.push(next!);
    done.add(next!.id);
  }

  return placed;
}

/** The earliest an item may start, given its availability and the traveler's preference. */
function earliestAllowedStart(
  item: JourneyItem,
  knowledge: KnowledgeBundle,
  date: IsoDate,
  warnings: Warning[],
): number {
  let earliest = 0;

  if (item.preferred_window_start) {
    earliest = Math.max(earliest, toMinutes(item.preferred_window_start));
  }

  if (!item.experience_id) return earliest;

  const experience = knowledge.experiences.find((e) => e.id === item.experience_id);
  const rules = knowledge.availability_rules.filter((r) => r.experience_id === item.experience_id);
  if (rules.length === 0) return earliest;

  const place = experience?.place_id
    ? knowledge.places.find((p) => p.id === experience.place_id)
    : undefined;

  const availability = resolveAvailability({
    rules,
    date,
    ...(place?.opening_schedule ? { openingSchedule: place.opening_schedule } : {}),
  });

  if (!availability.available || availability.windows.length === 0) {
    warnings.push({
      code: "outside_availability",
      itemId: item.id,
      message:
        availability.reason === "on_request"
          ? "This has to be arranged in advance, so it was not placed automatically."
          : "This is not available on that day.",
    });
    return earliest;
  }

  // The first window that has not already passed; otherwise the first window at all, so
  // the item is still placed and the day-window warning explains the consequence.
  const opens = availability.windows.map((w) => toMinutes(w.start));
  const usable = opens.find((open) => open >= earliest);
  return Math.max(earliest, usable ?? opens[0]!);
}

function durationOf(item: JourneyItem, knowledge: KnowledgeBundle): number | null {
  if (item.duration_likely_minutes != null) return item.duration_likely_minutes;

  if (item.experience_id) {
    const experience = knowledge.experiences.find((e) => e.id === item.experience_id);
    if (experience?.duration_likely_minutes != null) return experience.duration_likely_minutes;
  }

  if (item.place_id) {
    const place = knowledge.places.find((p) => p.id === item.place_id);
    if (place?.visit_duration_likely_minutes != null) return place.visit_duration_likely_minutes;
  }

  if (item.route_id) {
    const route = knowledge.routes.find((r) => r.id === item.route_id);
    if (route?.duration_likely_minutes != null) return route.duration_likely_minutes;
  }

  return null;
}

/**
 * Travel time between two consecutive items.
 *
 * Prefers a cached estimate for the exact pair and mode, then a curated transport
 * connection, then nothing. It never guesses a distance-based figure: a made-up travel
 * time is indistinguishable from a real one on screen, and would quietly become the
 * reason a traveler missed something.
 */
export function travelMinutes(
  from: JourneyItem,
  to: JourneyItem,
  knowledge: KnowledgeBundle,
): number {
  const fromPlace = from.place_id;
  const toPlace = to.place_id;
  if (!fromPlace || !toPlace || fromPlace === toPlace) return 0;

  const mode = to.travel_mode ?? "vehicle";

  const estimate = (knowledge.travel_estimates ?? []).find(
    (e: TravelEstimate) =>
      e.from_place_id === fromPlace && e.to_place_id === toPlace && e.mode === mode,
  );
  if (estimate?.duration_seconds != null) return Math.round(estimate.duration_seconds / 60);

  const connection = knowledge.transport_connections.find(
    (c) => c.from_place_id === fromPlace && c.to_place_id === toPlace,
  );
  if (connection?.duration_likely_minutes != null) return connection.duration_likely_minutes;

  return 0;
}
