import { describe, expect, it } from "vitest";

import { projectActuals } from "./actuals";
import { computeHealth } from "./health";
import { getNowNextLater } from "./live";
import { toInstant } from "./time";
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
};
const at = (hh: number, mm = 0) => toInstant(START, hh * 60 + mm, TZ);

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

/** a 06:00–08:00, b 08:30–09:30, a fixed train at 10:00, c 11:00–12:00. */
const day = (over: Partial<JourneyItem> = {}) => [
  item({
    id: "a",
    sort_order: 0,
    planned_start_at: at(6),
    planned_end_at: at(8),
    duration_likely_minutes: 120,
    ...over,
  }),
  item({
    id: "b",
    sort_order: 1,
    planned_start_at: at(8, 30),
    planned_end_at: at(9, 30),
    duration_likely_minutes: 60,
  }),
  item({
    id: "t",
    sort_order: 2,
    tier: "fixed",
    fixed_start_at: at(10),
    planned_start_at: at(10),
    planned_end_at: at(10, 30),
  }),
  item({
    id: "c",
    sort_order: 3,
    planned_start_at: at(11),
    planned_end_at: at(12),
    duration_likely_minutes: 60,
  }),
];

const byId = (items: JourneyItem[]) => new Map(items.map((i) => [i.id, i]));

/** Instants compared as instants: the projection writes UTC, the fixtures carry +05:30. */
const same = (instant: string | null | undefined) => (instant ? Date.parse(instant) : null);

describe("projectActuals", () => {
  it("leaves a day with nothing recorded exactly as it was", () => {
    const items = day();
    expect(projectActuals(items)).toBe(items);
  });

  it("ends a late item when it really ends, and moves what is ahead by as much", () => {
    const late = byId(
      projectActuals(
        day({ status: "in_progress", actual_start_at: at(6), actual_end_at: at(8, 40) }),
      ),
    );

    expect(same(late.get("a")?.planned_end_at)).toBe(same(at(8, 40)));
    expect(late.get("a")?.duration_likely_minutes).toBe(160);
    expect(same(late.get("b")?.planned_start_at)).toBe(same(at(9, 10)));
    expect(same(late.get("b")?.planned_end_at)).toBe(same(at(10, 10)));
  });

  it("never moves a FIXED item, and keeps moving what comes after it", () => {
    const late = byId(projectActuals(day({ status: "in_progress", actual_end_at: at(8, 40) })));

    expect(late.get("t")?.planned_start_at).toBe(at(10));
    expect(same(late.get("c")?.planned_start_at)).toBe(same(at(11, 40)));
  });

  it("pulls nothing earlier when something finished early", () => {
    const early = byId(projectActuals(day({ status: "done", actual_end_at: at(7, 30) })));

    expect(early.get("a")?.planned_end_at).toBe(at(8));
    expect(early.get("b")?.planned_start_at).toBe(at(8, 30));
  });

  it("does not shift what is already done", () => {
    const items = day({ status: "in_progress", actual_end_at: at(8, 40) });
    items[1] = { ...items[1]!, status: "skipped" };

    expect(byId(projectActuals(items)).get("b")?.planned_start_at).toBe(at(8, 30));
  });

  it("is idempotent", () => {
    const once = projectActuals(day({ status: "in_progress", actual_end_at: at(8, 40) }));
    expect(projectActuals(once)).toEqual(once);
  });
});

describe("running late, as the readers see it", () => {
  const late = day({ status: "in_progress", actual_start_at: at(6), actual_end_at: at(8, 40) });

  it("keeps the late item in NOW past its planned end", () => {
    const live = getNowNextLater({ journey, items: late, knowledge, nowAt: at(8, 15) });

    expect(live.now.itemId).toBe("a");
    expect(live.next?.itemId).toBe("b");
  });

  it("counts the overrun as load in Journey Health", () => {
    const planned = computeHealth({ journey, items: day(), knowledge });
    const running = computeHealth({ journey, items: late, knowledge });

    // Before the train: 180 of 240 minutes as planned, 220 of 240 as it is going.
    expect(running.days[0]!.timeLoadPct).toBeGreaterThan(planned.days[0]!.timeLoadPct);
  });
});
