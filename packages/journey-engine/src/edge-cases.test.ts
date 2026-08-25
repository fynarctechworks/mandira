import { describe, expect, it } from "vitest";
import { resolveAvailability } from "./availability";
import { scheduleDay, travelMinutes } from "./schedule";
import { fromInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";

/**
 * The awkward inputs.
 *
 * Ops data is entered by people against sources of varying quality, so the engine meets
 * partially-filled and occasionally contradictory rows as a matter of course. None of
 * these should make a whole journey unschedulable.
 */
const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const journey: Journey = {
  id: "j1",
  start_date: START,
  timezone: TZ,
  day_start_time: "06:00",
  day_end_time: "21:00",
};

const empty: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

describe("partial availability data", () => {
  it("treats a malformed time in a window as a dropped window, not a crash", () => {
    const result = resolveAvailability({
      rules: [
        {
          id: "r",
          experience_id: "e",
          kind: "daily_fixed_times",
          daily_times: [{ start: "not-a-time", end: "07:30" }],
          priority: 1,
        },
      ],
      date: START,
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("outside_windows");
  });

  it("treats a weekday absent from the pattern as unavailable, not an error", () => {
    const result = resolveAvailability({
      rules: [
        {
          id: "r",
          experience_id: "e",
          kind: "weekly_pattern",
          weekly_pattern: { sun: [{ start: "06:00", end: "07:00" }] },
          priority: 1,
        },
      ],
      date: START,
    });
    expect(result.reason).toBe("not_on_this_date");
  });

  it("distinguishes a place with no opening hours recorded from one that is closed", () => {
    // Both are unschedulable, but only one is a data gap — Ops needs to tell them apart.
    const noSchedule = resolveAvailability({
      rules: [{ id: "r", experience_id: "e", kind: "always_during_opening", priority: 1 }],
      date: START,
    });
    expect(noSchedule.reason).toBe("closed");

    const explicitlyClosed = resolveAvailability({
      rules: [{ id: "r", experience_id: "e", kind: "always_during_opening", priority: 1 }],
      date: START,
      openingSchedule: { weekly: { mon: [] } },
    });
    expect(explicitlyClosed.reason).toBe("closed");
  });

  it("handles an exception day with neither closure nor hours", () => {
    const result = resolveAvailability({
      rules: [{ id: "r", experience_id: "e", kind: "always_during_opening", priority: 1 }],
      date: START,
      openingSchedule: { weekly: { mon: [["06:00", "12:00"]] }, exceptions: [{ date: START }] },
    });
    // An exception with no hours listed means the day is not as usual, and nothing is known.
    expect(result.windows).toEqual([]);
  });

  it("ignores a date_range rule missing one of its ends", () => {
    const result = resolveAvailability({
      rules: [{ id: "r", experience_id: "e", kind: "date_range", date_start: START, priority: 1 }],
      date: START,
    });
    expect(result.reason).toBe("not_on_this_date");
  });
});

describe("partial scheduling data", () => {
  it("falls back to a route's duration when the item has none", () => {
    const knowledge: KnowledgeBundle = {
      ...empty,
      routes: [{ id: "r1", duration_likely_minutes: 75 }],
    };

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, route_id: "r1" })],
    });

    expect(fromInstant(items[0]!.planned_end_at!, START, TZ)).toBe(6 * 60 + 75);
  });

  it("schedules an experience that has no availability rules at all", () => {
    // "Not recorded" must not become "not schedulable" — Ops fills these in over time.
    const knowledge: KnowledgeBundle = {
      ...empty,
      experiences: [{ id: "e1", duration_likely_minutes: 30 }],
    };

    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, experience_id: "e1" })],
    });

    expect(items[0]!.planned_start_at).not.toBeNull();
    expect(warnings).toEqual([]);
  });

  it("explains an on-request experience differently from an unavailable one", () => {
    const knowledge: KnowledgeBundle = {
      ...empty,
      experiences: [{ id: "e1", duration_likely_minutes: 30 }],
      availability_rules: [{ id: "r1", experience_id: "e1", kind: "on_request", priority: 1 }],
    };

    const { warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, experience_id: "e1" })],
    });

    expect(warnings[0]!.message).toMatch(/arranged in advance/);
  });

  it("returns an empty day rather than failing when there is nothing to schedule", () => {
    const result = scheduleDay({ journey, dayIndex: 0, knowledge: empty, items: [] });
    expect(result).toEqual({ items: [], warnings: [] });
  });

  it("counts no travel between two items at the same place", () => {
    const a = item({ id: "a", sort_order: 0, place_id: "p1" });
    const b = item({ id: "b", sort_order: 1, place_id: "p1" });
    expect(travelMinutes(a, b, empty)).toBe(0);
  });

  it("counts no travel when either end has no place", () => {
    const withPlace = item({ id: "a", sort_order: 0, place_id: "p1" });
    const without = item({ id: "b", sort_order: 1 });
    expect(travelMinutes(withPlace, without, empty)).toBe(0);
    expect(travelMinutes(without, withPlace, empty)).toBe(0);
  });

  it("ignores a cached estimate recorded for a different mode", () => {
    // A walking time must never be used for a drive, or the plan silently gains an hour.
    const knowledge: KnowledgeBundle = {
      ...empty,
      travel_estimates: [
        { from_place_id: "p1", to_place_id: "p2", mode: "walk", duration_seconds: 3600 },
      ],
    };

    const a = item({ id: "a", sort_order: 0, place_id: "p1" });
    const b = item({ id: "b", sort_order: 1, place_id: "p2", travel_mode: "vehicle" });
    expect(travelMinutes(a, b, knowledge)).toBe(0);
  });

  it("places a fixed item that is the only thing in the day", () => {
    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: empty,
      items: [
        item({
          id: "train",
          sort_order: 0,
          tier: "fixed",
          fixed_start_at: `${START}T18:30:00+05:30`,
          duration_likely_minutes: 30,
        }),
      ],
    });

    expect(fromInstant(items[0]!.planned_start_at!, START, TZ)).toBe(18 * 60 + 30);
    expect(warnings).toEqual([]);
  });
});
