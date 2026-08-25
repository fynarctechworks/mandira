import { describe, expect, it } from "vitest";
import { checkReturnGuard } from "./return-guard";
import { scheduleDay } from "./schedule";
import { fromInstant, toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle, TravelerProfile } from "./types";

const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const journey: Journey = {
  id: "j1",
  start_date: START,
  timezone: TZ,
  day_start_time: "06:00",
  day_end_time: "21:00",
};

/** Minutes from local midnight, for readable assertions. */
const at = (iso: string | null | undefined, date = START) =>
  iso ? fromInstant(iso, date, TZ) : null;

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

const emptyKnowledge: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

describe("scheduleDay", () => {
  it("places items in order from the start of the day", () => {
    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 90 }),
        item({ id: "b", sort_order: 1, duration_likely_minutes: 45 }),
      ],
    });

    expect(at(items[0]!.planned_start_at)).toBe(6 * 60);
    expect(at(items[0]!.planned_end_at)).toBe(7 * 60 + 30);
    // 07:30 + 15 buffer
    expect(at(items[1]!.planned_start_at)).toBe(7 * 60 + 45);
  });

  it("adds no buffer before the first item of the day", () => {
    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 30 })],
    });
    expect(at(items[0]!.planned_start_at)).toBe(6 * 60);
  });

  it("scales the buffer to the group's needs", () => {
    const travelers: TravelerProfile[] = [
      { id: "t", mobility: "limited_walking", age_band: "senior" },
    ];

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      travelers,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 1, duration_likely_minutes: 30 }),
      ],
    });

    // 07:00 + 23 (15 x 1.5, rounded up)
    expect(at(items[1]!.planned_start_at)).toBe(7 * 60 + 23);
  });

  it("never moves a FIXED item, and says when earlier items overrun it", () => {
    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "long", sort_order: 0, duration_likely_minutes: 600 }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          item_type: "fixed_commitment",
          fixed_start_at: `${START}T15:00:00+05:30`,
          duration_likely_minutes: 60,
        }),
      ],
    });

    // 06:00 + 600 = 16:00, which is past the 15:00 anchor.
    expect(at(items[1]!.planned_start_at)).toBe(15 * 60);
    expect(warnings.find((w) => w.code === "fixed_overlap")).toMatchObject({
      itemId: "train",
      byMinutes: 75,
    });
  });

  it("waits for an availability window to open", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", duration_likely_minutes: 60 }],
      availability_rules: [
        {
          id: "r1",
          experience_id: "e1",
          kind: "daily_fixed_times",
          daily_times: [{ start: "09:00", end: "12:00" }],
          priority: 1,
        },
      ],
    };

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, experience_id: "e1" })],
    });

    // Even though the day opens at 06:00, the experience cannot start before 09:00.
    expect(at(items[0]!.planned_start_at)).toBe(9 * 60);
  });

  it("warns rather than silently dropping an item unavailable that day", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", duration_likely_minutes: 60 }],
      availability_rules: [
        {
          id: "r1",
          experience_id: "e1",
          kind: "calendar_dates",
          calendar_dates: ["2026-12-25"],
          priority: 1,
        },
      ],
    };

    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, experience_id: "e1" })],
    });

    // PRD Principle 6: what to give up is the traveler's decision, so it is still placed.
    expect(items[0]!.planned_start_at).not.toBeNull();
    expect(warnings.map((w) => w.code)).toContain("outside_availability");
  });

  it("respects a preferred window the traveler set", () => {
    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({
          id: "a",
          sort_order: 0,
          duration_likely_minutes: 60,
          preferred_window_start: "10:00",
        }),
      ],
    });
    expect(at(items[0]!.planned_start_at)).toBe(10 * 60);
  });

  it("honours a dependency over sort order", () => {
    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "first", sort_order: 0, duration_likely_minutes: 30 }),
        item({ id: "second", sort_order: 1, duration_likely_minutes: 30 }),
      ],
      dependencies: [{ item_id: "first", after_item_id: "second" }],
    });

    expect(items.map((i) => i.id)).toEqual(["second", "first"]);
  });

  it("reports a dependency cycle instead of hanging or refusing the day", () => {
    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 30 }),
        item({ id: "b", sort_order: 1, duration_likely_minutes: 30 }),
      ],
      dependencies: [
        { item_id: "a", after_item_id: "b" },
        { item_id: "b", after_item_id: "a" },
      ],
    });

    expect(warnings.some((w) => w.code === "dependency_cycle")).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("adds travel time from a cached estimate", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      travel_estimates: [
        { from_place_id: "p1", to_place_id: "p2", mode: "vehicle", duration_seconds: 1200 },
      ],
    };

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [
        item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 30 }),
      ],
    });

    // 07:00 + 20 travel + 15 buffer
    expect(at(items[1]!.planned_start_at)).toBe(7 * 60 + 35);
  });

  it("falls back to a curated transport connection when no estimate is cached", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      transport_connections: [
        {
          id: "tc1",
          from_place_id: "p1",
          to_place_id: "p2",
          mode: "vehicle",
          duration_likely_minutes: 25,
        },
      ],
    };

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [
        item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 30 }),
      ],
    });
    expect(at(items[1]!.planned_start_at)).toBe(7 * 60 + 40);
  });

  it("never invents a travel time it does not have", () => {
    // A made-up figure is indistinguishable from a real one on screen, and would quietly
    // become the reason a traveler missed something.
    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 30 }),
      ],
    });
    expect(at(items[1]!.planned_start_at)).toBe(7 * 60 + 15);
  });

  it("warns when the day overruns its end", () => {
    const { warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 16 * 60 })],
    });

    expect(warnings.find((w) => w.code === "outside_day_window")).toMatchObject({
      itemId: "a",
      byMinutes: 60,
    });
  });

  it("cannot place an item with no duration, and says so", () => {
    const { items, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0 })],
    });

    expect(items[0]!.planned_start_at).toBeNull();
    expect(warnings.map((w) => w.code)).toContain("no_duration");
  });

  it("takes duration from the referenced knowledge when the item has none", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      places: [{ id: "p1", visit_duration_likely_minutes: 40 }],
    };

    const { items } = scheduleDay({
      journey,
      dayIndex: 0,
      knowledge,
      items: [item({ id: "a", sort_order: 0, place_id: "p1" })],
    });
    expect(at(items[0]!.planned_end_at)).toBe(6 * 60 + 40);
  });

  it("only schedules the requested day", () => {
    const { items } = scheduleDay({
      journey,
      dayIndex: 1,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "d0", sort_order: 0, day_index: 0, duration_likely_minutes: 30 }),
        item({ id: "d1", sort_order: 0, day_index: 1, duration_likely_minutes: 30 }),
      ],
    });

    expect(items.map((i) => i.id)).toEqual(["d1"]);
    // Day 1 is the day after the journey starts.
    expect(items[0]!.planned_start_at).toContain("2026-10-13");
  });
});

/**
 * PRD Appendix A, worked end to end.
 *
 * This is the specification's own example, so it is the closest thing to an oracle the
 * engine has: if the numbers here drift, the engine and the product definition have
 * diverged regardless of what any other test says.
 */
describe("PRD Appendix A worked example", () => {
  const travelers: TravelerProfile[] = [
    { id: "senior", mobility: "limited_walking", age_band: "senior" },
  ];

  const knowledge: KnowledgeBundle = {
    ...emptyKnowledge,
    travel_estimates: [
      {
        from_place_id: "darshan",
        to_place_id: "breakfast",
        mode: "walk",
        duration_seconds: 12 * 60,
      },
      {
        from_place_id: "breakfast",
        to_place_id: "shrineB",
        mode: "walk",
        duration_seconds: 6 * 60,
      },
      {
        from_place_id: "shrineB",
        to_place_id: "viewC",
        mode: "vehicle",
        duration_seconds: 20 * 60,
      },
      { from_place_id: "viewC", to_place_id: "lunch", mode: "vehicle", duration_seconds: 25 * 60 },
      { from_place_id: "lunch", to_place_id: "museumD", mode: "walk", duration_seconds: 4 * 60 },
      {
        from_place_id: "museumD",
        to_place_id: "aarti",
        mode: "vehicle",
        duration_seconds: 30 * 60,
      },
    ],
  };

  const items: JourneyItem[] = [
    item({
      id: "darshan",
      sort_order: 0,
      tier: "protected",
      place_id: "darshan",
      duration_likely_minutes: 90,
      travel_mode: "walk",
    }),
    item({
      id: "breakfast",
      sort_order: 1,
      item_type: "rest",
      tier: "optional",
      place_id: "breakfast",
      duration_likely_minutes: 45,
      travel_mode: "walk",
    }),
    item({
      id: "shrineB",
      sort_order: 2,
      place_id: "shrineB",
      duration_likely_minutes: 60,
      travel_mode: "walk",
    }),
    item({
      id: "viewC",
      sort_order: 3,
      tier: "optional",
      place_id: "viewC",
      duration_likely_minutes: 45,
      travel_mode: "vehicle",
    }),
    item({
      id: "lunch",
      sort_order: 4,
      item_type: "rest",
      tier: "optional",
      place_id: "lunch",
      duration_likely_minutes: 60,
      travel_mode: "vehicle",
    }),
    item({
      id: "museumD",
      sort_order: 5,
      tier: "optional",
      place_id: "museumD",
      duration_likely_minutes: 60,
      travel_mode: "walk",
    }),
    item({
      id: "aarti",
      sort_order: 6,
      tier: "protected",
      place_id: "aarti",
      duration_likely_minutes: 60,
      travel_mode: "vehicle",
      preferred_window_start: "18:30",
    }),
  ];

  it("uses a 23-minute buffer for the senior with limited walking", () => {
    const { items: scheduled } = scheduleDay({ journey, dayIndex: 0, items, knowledge, travelers });
    // Appendix A says 22.5; a real schedule needs whole minutes, so 23 (rounded up).
    expect(scheduled[1]!.buffer_minutes).toBe(23);
  });

  it("accounts for 420 minutes of items and 97 of travel", () => {
    const itemMinutes = items.reduce((sum, i) => sum + (i.duration_likely_minutes ?? 0), 0);
    expect(itemMinutes).toBe(420);

    const travel = knowledge.travel_estimates!.reduce(
      (sum, e) => sum + (e.duration_seconds ?? 0) / 60,
      0,
    );
    expect(travel).toBe(97);
  });

  it("fits the day inside its 06:00–21:00 window with the aarti at 18:30", () => {
    const { items: scheduled, warnings } = scheduleDay({
      journey,
      dayIndex: 0,
      items,
      knowledge,
      travelers,
    });

    const aarti = scheduled.find((i) => i.id === "aarti")!;
    expect(hhmm(at(aarti.planned_start_at)!)).toBe("18:30");
    expect(hhmm(at(aarti.planned_end_at)!)).toBe("19:30");

    // Comfortable in the PRD's terms: nothing overruns the day.
    expect(warnings.filter((w) => w.code === "outside_day_window")).toEqual([]);
  });

  it("leaves slack before the aarti rather than arriving exactly on time", () => {
    const { items: scheduled } = scheduleDay({
      journey,
      dayIndex: 0,
      items,
      knowledge,
      travelers,
    });

    const museum = scheduled.find((i) => i.id === "museumD")!;
    const aarti = scheduled.find((i) => i.id === "aarti")!;
    const slack = at(aarti.planned_start_at)! - at(museum.planned_end_at)! - 30 - 23;

    expect(slack).toBeGreaterThan(0);
  });
});

describe("checkReturnGuard (PRD-PLAN-006)", () => {
  const knowledge: KnowledgeBundle = {
    ...emptyKnowledge,
    travel_estimates: [
      {
        from_place_id: "museum",
        to_place_id: "station",
        mode: "vehicle",
        duration_seconds: 30 * 60,
      },
    ],
  };

  it("reports nothing to guard when there is no fixed anchor", () => {
    const result = checkReturnGuard({
      journey,
      knowledge,
      items: [item({ id: "a", sort_order: 0, planned_end_at: `${START}T12:00:00+05:30` })],
    });
    expect(result).toMatchObject({ ok: true, anchorItemId: null });
  });

  it("holds when the traveler leaves in time", () => {
    const result = checkReturnGuard({
      journey,
      knowledge,
      items: [
        item({
          id: "museum",
          sort_order: 0,
          place_id: "museum",
          planned_end_at: `${START}T17:00:00+05:30`,
          buffer_minutes: 15,
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          place_id: "station",
          fixed_start_at: `${START}T18:30:00+05:30`,
        }),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.breachMinutes).toBe(0);
    // 18:30 − 30 travel − 15 buffer = 17:45
    expect(at(result.requiredDepartureAt)).toBe(17 * 60 + 45);
  });

  it("reports a breach in minutes rather than fixing it", () => {
    // The engine never removes an item to make a return work — PRD F5 makes this Broken
    // health and the traveler chooses through a Change Card.
    const result = checkReturnGuard({
      journey,
      knowledge,
      items: [
        item({
          id: "museum",
          sort_order: 0,
          place_id: "museum",
          planned_end_at: `${START}T18:00:00+05:30`,
          buffer_minutes: 15,
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          place_id: "station",
          fixed_start_at: `${START}T18:30:00+05:30`,
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.breachMinutes).toBe(15);
    expect(result.anchorItemId).toBe("train");
  });

  it("guards the LAST fixed item when there are several", () => {
    const result = checkReturnGuard({
      journey,
      knowledge,
      items: [
        item({
          id: "earlier",
          sort_order: 0,
          tier: "fixed",
          fixed_start_at: `${START}T09:00:00+05:30`,
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          fixed_start_at: `${START}T18:30:00+05:30`,
        }),
      ],
    });
    expect(result.anchorItemId).toBe("train");
  });

  it("allows an arrival buffer for boarding", () => {
    const result = checkReturnGuard({
      journey,
      knowledge,
      arrivalBufferMinutes: 20,
      items: [
        item({
          id: "museum",
          sort_order: 0,
          place_id: "museum",
          planned_end_at: `${START}T17:30:00+05:30`,
          buffer_minutes: 15,
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          place_id: "station",
          fixed_start_at: `${START}T18:30:00+05:30`,
        }),
      ],
    });

    // 18:30 − 30 − 15 − 20 = 17:25, so leaving at 17:30 misses by 5.
    expect(result.breachMinutes).toBe(5);
  });
});

describe("checkReturnGuard — the case that used to slip through", () => {
  it("catches an item that runs PAST the return, not only one that ends too late to reach it", () => {
    /*
     * The clearest possible breach: a 90-minute darshan starting at 06:00 with the train
     * at 06:30. An earlier version selected the preceding item by "ends at or before the
     * anchor", which excluded this one entirely — leaving no preceding item, and the guard
     * reporting ok on the one shape it exists to catch (found in B-019).
     */
    const result = checkReturnGuard({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({
          id: "darshan",
          sort_order: 0,
          duration_likely_minutes: 90,
          planned_start_at: toInstant(START, 6 * 60, TZ),
          planned_end_at: toInstant(START, 7 * 60 + 30, TZ),
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          item_type: "fixed_commitment",
          fixed_start_at: toInstant(START, 6 * 60 + 30, TZ),
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.breachMinutes).toBe(60);
    expect(result.anchorItemId).toBe("train");
  });

  it("still holds when the day finishes with room to reach the return", () => {
    const result = checkReturnGuard({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({
          id: "darshan",
          sort_order: 0,
          duration_likely_minutes: 60,
          planned_start_at: toInstant(START, 6 * 60, TZ),
          planned_end_at: toInstant(START, 7 * 60, TZ),
        }),
        item({
          id: "train",
          sort_order: 1,
          tier: "fixed",
          item_type: "fixed_commitment",
          fixed_start_at: toInstant(START, 9 * 60, TZ),
        }),
      ],
    });

    expect(result.ok).toBe(true);
  });
});
