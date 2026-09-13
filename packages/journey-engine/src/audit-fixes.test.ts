import { describe, expect, it } from "vitest";
import { evaluateChange } from "./change";
import { computeHealth } from "./health";
import { toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";

/*
 * Regression tests for the engine defects found by the 2026-09-12 audit
 * (docs/PROJECT_AUDIT.md §6). Each failed against the engine as it stood before the fix.
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

const emptyKnowledge: KnowledgeBundle = {
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

const on = (hh: number, mm = 0, dayIndex = 0) =>
  toInstant(START, dayIndex * 1440 + hh * 60 + mm, TZ);

const fixed = (id: string, hh: number, sortOrder: number, dayIndex = 0) =>
  item({
    id,
    sort_order: sortOrder,
    day_index: dayIndex,
    tier: "fixed",
    item_type: "fixed_commitment",
    fixed_start_at: on(hh, 0, dayIndex),
    duration_likely_minutes: 30,
    planned_start_at: on(hh, 0, dayIndex),
    planned_end_at: on(hh, 30, dayIndex),
  });

describe("time load is measured up to the next FIXED item (PRD F5)", () => {
  it("breaks the day when what comes before a fixed time cannot fit before it", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 150 }),
        fixed("train", 8, 1),
        fixed("home", 20, 2),
      ],
    });

    expect(report.days[0]!.causes).toContainEqual({
      check: "time_load",
      key: "health.cause.fixed_unreachable",
      params: { minutes: 30 },
      itemId: "train",
    });
    expect(report.days[0]!.state).toBe("broken");
  });

  it("reads Tight when the stretch before a fixed time is crowded, however empty the rest of the day", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 50 }), fixed("train", 7, 1)],
    });

    expect(report.days[0]!.timeLoadPct).toBe(83);
    expect(report.days[0]!.state).toBe("tight");
  });

  it("decides Tight on the unrounded load, so 80.4% is not rounded into Comfortable", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 724 })],
    });

    expect(report.days[0]!.timeLoadPct).toBe(80);
    expect(report.days[0]!.state).toBe("tight");
  });
});

describe("availability covers the whole visit, not its first minute", () => {
  const knowledge: KnowledgeBundle = {
    ...emptyKnowledge,
    experiences: [{ id: "e1" }],
    availability_rules: [
      {
        id: "r1",
        experience_id: "e1",
        kind: "daily_fixed_times",
        daily_times: [{ start: "10:00", end: "11:00" }],
        priority: 1,
      },
    ],
  };

  it("flags a visit that starts inside its window and runs past closing", () => {
    const report = computeHealth({
      journey,
      knowledge,
      items: [
        item({
          id: "a",
          sort_order: 0,
          tier: "protected",
          experience_id: "e1",
          duration_likely_minutes: 60,
          planned_start_at: on(10, 30),
          planned_end_at: on(11, 30),
        }),
      ],
    });

    expect(report.days[0]!.causes).toContainEqual({
      check: "availability",
      key: "health.cause.runs_past_availability",
      params: { at: "10:30", closes: "11:00" },
      itemId: "a",
    });
    expect(report.days[0]!.state).toBe("broken");
  });

  it("passes a visit that finishes exactly at closing", () => {
    const report = computeHealth({
      journey,
      knowledge,
      items: [
        item({
          id: "a",
          sort_order: 0,
          tier: "protected",
          experience_id: "e1",
          duration_likely_minutes: 60,
          planned_start_at: on(10),
          planned_end_at: on(11),
        }),
      ],
    });

    expect(report.days[0]!.causes).toEqual([]);
  });
});

describe("the return guard is reported on the anchor's own day", () => {
  it("does not mark an earlier, healthy day Broken for a late return", () => {
    const report = computeHealth({
      journey: { ...journey, end_date: "2026-10-13" },
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
        item({
          id: "b",
          sort_order: 0,
          day_index: 1,
          duration_likely_minutes: 600,
          planned_start_at: on(6, 0, 1),
          planned_end_at: on(16, 0, 1),
        }),
        fixed("home", 15, 1, 1),
      ],
    });

    expect(report.days[0]!.state).toBe("comfortable");
    expect(report.days[0]!.causes.some((c) => c.check === "return_guard")).toBe(false);
    expect(report.days[1]!.state).toBe("broken");
    expect(report.days[1]!.causes.some((c) => c.key === "health.cause.return_guard_breached")).toBe(
      true,
    );
  });
});

describe("every day of the journey is reported", () => {
  it("includes a day with nothing planned yet", () => {
    const report = computeHealth({
      journey: { ...journey, end_date: "2026-10-14" },
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
        item({ id: "c", sort_order: 0, day_index: 2, duration_likely_minutes: 60 }),
      ],
    });

    expect(report.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);
    expect(report.days[1]!).toMatchObject({ state: "comfortable", causes: [], timeLoadPct: 0 });
  });
});

describe("Change Card options are judged on the days they touch", () => {
  it("still offers a way through when an unrelated day is already Broken", () => {
    const card = evaluateChange({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 400 }),
        item({ id: "c", sort_order: 1, tier: "optional", duration_likely_minutes: 400 }),
        item({ id: "z", sort_order: 0, day_index: 1, duration_likely_minutes: 1000 }),
      ],
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 200 },
    });

    expect(card.recommended?.id).toBe("opt-e-remove-c");
    expect(card.recommended?.resultingState).toBe("comfortable");

    const removed = card.recommended!.affected.find((entry) => entry.itemId === "c");
    expect(removed).toMatchObject({ beforeDayIndex: 0, afterDayIndex: null, afterStartAt: null });
    expect(removed?.beforeStartAt).not.toBeNull();
  });

  it("offers moving an OPTIONAL item to another day at rung (b), with its new day", () => {
    const card = evaluateChange({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 400 }),
        item({ id: "c", sort_order: 1, tier: "optional", duration_likely_minutes: 400 }),
        item({ id: "z", sort_order: 0, day_index: 1, duration_likely_minutes: 60 }),
      ],
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 200 },
    });

    expect(card.recommended).toMatchObject({
      id: "opt-b-move-c",
      step: "b",
      labelKey: "change.option.move_optional_to_day",
      params: { itemId: "c", toDayIndex: 1 },
    });
    expect(card.recommended!.affected).toContainEqual(
      expect.objectContaining({ itemId: "c", beforeDayIndex: 0, afterDayIndex: 1 }),
    );
  });

  it("refuses a move that relieves today by breaking the day it lands on", () => {
    const card = evaluateChange({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, tier: "protected", duration_likely_minutes: 400 }),
        item({ id: "c", sort_order: 1, tier: "optional", duration_likely_minutes: 400 }),
        item({ id: "z", sort_order: 0, day_index: 1, duration_likely_minutes: 600 }),
      ],
      trigger: { kind: "user_late", dayIndex: 0, itemId: "a", deltaMinutes: 200 },
    });

    expect(card.options.some((option) => option.id === "opt-b-move-c")).toBe(false);
    expect(card.recommended?.step).toBe("e");
  });
});
