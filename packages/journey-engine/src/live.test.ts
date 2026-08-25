import { describe, expect, it } from "vitest";
import { getNowNextLater } from "./live";
import { scheduleDay } from "./schedule";
import { fromInstant, toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";

const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const journey: Journey = {
  id: "j1",
  start_date: START,
  timezone: TZ,
  day_start_time: "06:00",
  day_end_time: "21:00",
};

const knowledge: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [
    { from_place_id: "p1", to_place_id: "p2", mode: "vehicle", duration_seconds: 1800 },
  ],
};

/** An instant at the given local wall time on day 0. */
const at = (hh: number, mm = 0) => toInstant(START, hh * 60 + mm, TZ);

/** Minutes from local midnight, for readable assertions. */
const local = (iso: string | null) => (iso ? fromInstant(iso, START, TZ) : null);

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

/** A scheduled day, so the projection reads the same planned times the app would. */
function scheduled(items: JourneyItem[]): JourneyItem[] {
  return scheduleDay({ journey, dayIndex: 0, items, knowledge }).items;
}

const day = () =>
  scheduled([
    item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 120 }),
    item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 60 }),
    item({ id: "c", sort_order: 2, tier: "optional", place_id: "p2", duration_likely_minutes: 60 }),
  ]);

describe("getNowNextLater", () => {
  it("puts the item in progress in NOW", () => {
    // a runs 06:00–08:00.
    const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(7) });

    expect(live.now.kind).toBe("item");
    expect(live.now.itemId).toBe("a");
    expect(live.now.placeId).toBe("p1");
  });

  it("puts the one after it in NEXT, and the rest in LATER", () => {
    const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(7) });

    expect(live.next?.itemId).toBe("b");
    expect(live.later.map((r) => r.itemId)).toEqual(["c"]);
  });

  it("carries the tier into every LATER row, because that is what the row shows", () => {
    const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(7) });

    expect(live.later[0]).toMatchObject({ itemId: "c", tier: "optional" });
  });

  it("says how long until the next thing starts", () => {
    // b starts at 08:45 (a ends 08:00 + 30 travel + 15 buffer).
    const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(8, 15) });

    expect(local(live.next?.startAt ?? null)).toBe(8 * 60 + 45);
    expect(live.next?.inMinutes).toBe(30);
  });

  it("shows the travel leg as the current focus between two items", () => {
    // 08:00–08:45 is the gap after a: 30 minutes of driving plus a 15-minute buffer.
    const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(8, 15) });

    expect(live.now.kind).toBe("travel");
    expect(live.now.travelMinutes).toBe(30);
    expect(live.now.itemId).toBe("b");
  });

  it("calls a gap with nowhere to go free time rather than travel", () => {
    const items = scheduled([
      item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 120 }),
      item({ id: "b", sort_order: 1, place_id: "p1", duration_likely_minutes: 60 }),
    ]);

    const live = getNowNextLater({ journey, items, knowledge, nowAt: at(8, 5) });

    expect(live.now.kind).toBe("free");
    expect(live.now.travelMinutes).toBeUndefined();
  });

  it("says there is nothing to do during a rest block", () => {
    const items = scheduled([
      item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
      item({ id: "lunch", sort_order: 1, item_type: "rest", duration_likely_minutes: 60 }),
      item({ id: "b", sort_order: 2, duration_likely_minutes: 60 }),
    ]);

    // lunch runs 07:15–08:15.
    const live = getNowNextLater({ journey, items, knowledge, nowAt: at(7, 30) });

    expect(live.now.kind).toBe("free");
    expect(live.now.itemId).toBe("lunch");
  });

  describe("leave-by", () => {
    it("counts back from the next start through travel and its buffer", () => {
      const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(7) });

      // b starts 08:45, less 30 travel, less its 15-minute buffer.
      expect(local(live.leaveByAt)).toBe(8 * 60);
    });

    it("is the start itself when there is nowhere to travel from", () => {
      const items = scheduled([
        item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 1, place_id: "p1", duration_likely_minutes: 60 }),
      ]);

      const live = getNowNextLater({ journey, items, knowledge, nowAt: at(6, 30) });

      // b starts 07:15; no travel, so only its 15-minute buffer comes off.
      expect(local(live.leaveByAt)).toBe(7 * 60);
    });

    it("is absent once there is nothing left to leave for", () => {
      const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(20) });

      expect(live.leaveByAt).toBeNull();
      expect(live.next).toBeNull();
    });
  });

  describe("the edges of the day", () => {
    it("says the day is complete once everything has happened", () => {
      const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(20) });

      expect(live.now.kind).toBe("day_complete");
      expect(live.later).toEqual([]);
    });

    it("waits rather than starting early before the day begins", () => {
      const live = getNowNextLater({ journey, items: day(), knowledge, nowAt: at(5) });

      expect(live.now.kind).toBe("before_day");
      expect(live.next?.itemId).toBe("a");
    });

    it("has nothing to show for a day with no items at all", () => {
      const live = getNowNextLater({ journey, items: [], knowledge, nowAt: at(12) });

      expect(live.now.kind).toBe("before_day");
      expect(live.next).toBeNull();
      expect(live.later).toEqual([]);
    });

    it("ignores an item that could not be placed on the clock", () => {
      const items = [
        ...day(),
        item({ id: "unplaced", sort_order: 3, planned_start_at: null, planned_end_at: null }),
      ];

      const live = getNowNextLater({ journey, items, knowledge, nowAt: at(7) });

      expect(live.later.map((r) => r.itemId)).not.toContain("unplaced");
    });
  });

  it("reports the day's own health state, which is what the pill shows", () => {
    const items = scheduled([item({ id: "a", sort_order: 0, duration_likely_minutes: 1200 })]);

    const live = getNowNextLater({ journey, items, knowledge, nowAt: at(7) });

    expect(live.dayState).toBe("broken");
  });

  it("works out which day it is from the instant it was given", () => {
    const items = scheduled([item({ id: "a", sort_order: 0, duration_likely_minutes: 60 })]).concat(
      item({
        id: "d2",
        sort_order: 0,
        day_index: 1,
        duration_likely_minutes: 60,
        planned_start_at: toInstant(START, 1440 + 9 * 60, TZ),
        planned_end_at: toInstant(START, 1440 + 10 * 60, TZ),
      }),
    );

    const live = getNowNextLater({
      journey,
      items,
      knowledge,
      nowAt: toInstant(START, 1440 + 9 * 60 + 30, TZ),
    });

    expect(live.dayIndex).toBe(1);
    expect(live.now.itemId).toBe("d2");
  });

  it("takes no clock of its own — the same instant always gives the same answer", () => {
    const items = day();
    const first = getNowNextLater({ journey, items, knowledge, nowAt: at(7) });
    const second = getNowNextLater({ journey, items, knowledge, nowAt: at(7) });

    expect(second).toEqual(first);
  });
});
