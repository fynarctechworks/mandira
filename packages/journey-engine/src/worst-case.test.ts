import { describe, expect, it } from "vitest";

import { computeHealth } from "./health";
import type { Journey, JourneyItem, KnowledgeBundle } from "./types";
import { computeWorstCase, worstCaseItems } from "./worst-case";

const journey: Journey = {
  id: "j1",
  start_date: "2026-10-12",
  timezone: "Asia/Kolkata",
  day_start_time: "06:00",
  day_end_time: "21:00",
};

const knowledge: KnowledgeBundle = {
  places: [{ id: "p1", visit_duration_likely_minutes: 60, visit_duration_max_minutes: 150 }],
  experiences: [{ id: "e1", duration_likely_minutes: 240, duration_max_minutes: 420 }],
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

const STATES = ["comfortable", "tight", "at_risk", "broken"];

describe("worstCaseItems", () => {
  it("uses the experience's longest recorded time", () => {
    const [worst] = worstCaseItems(
      [item({ id: "a", sort_order: 0, experience_id: "e1", duration_likely_minutes: 240 })],
      knowledge,
    );
    expect(worst?.duration_likely_minutes).toBe(420);
  });

  it("prefers the item's own maximum, then the place's visit maximum", () => {
    const [own, visit] = worstCaseItems(
      [
        item({
          id: "a",
          sort_order: 0,
          experience_id: "e1",
          duration_likely_minutes: 240,
          duration_max_minutes: 300,
        }),
        item({ id: "b", sort_order: 1, place_id: "p1", duration_likely_minutes: 60 }),
      ],
      knowledge,
    );
    expect(own?.duration_likely_minutes).toBe(300);
    expect(visit?.duration_likely_minutes).toBe(150);
  });

  it("keeps an item with no longer time on record exactly as it is", () => {
    const plain = item({ id: "a", sort_order: 0, duration_likely_minutes: 45 });
    expect(worstCaseItems([plain], knowledge)[0]).toBe(plain);
  });
});

describe("computeWorstCase", () => {
  const day = [
    item({ id: "a", sort_order: 0, experience_id: "e1", duration_likely_minutes: 240 }),
    item({ id: "b", sort_order: 1, experience_id: "e1", duration_likely_minutes: 240 }),
  ];

  it("is never a better day than the likely plan", () => {
    const likely = computeHealth({ journey, items: day, knowledge });
    const worst = computeWorstCase({ journey, items: day, knowledge });

    expect(worst.days[0]!.timeLoadPct).toBeGreaterThan(likely.days[0]!.timeLoadPct);
    expect(STATES.indexOf(worst.days[0]!.state)).toBeGreaterThanOrEqual(
      STATES.indexOf(likely.days[0]!.state),
    );
  });

  it("returns a state and causes, never a score to display", () => {
    const worst = computeWorstCase({ journey, items: day, knowledge });
    expect(Object.keys(worst)).toEqual(["journeyState", "days"]);
  });
});
