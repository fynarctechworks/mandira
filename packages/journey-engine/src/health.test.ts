import { describe, expect, it } from "vitest";
import { computeHealth, decideState } from "./health";
import { toInstant } from "./time";
import type { Journey, JourneyItem, KnowledgeBundle, TravelerProfile } from "./types";

const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const journey: Journey = {
  id: "j1",
  start_date: START,
  timezone: TZ,
  day_start_time: "06:00",
  day_end_time: "21:00", // a 900-minute window
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

/** An instant on day 0 at the given local wall time. */
const on = (hh: number, mm = 0, dayIndex = 0) =>
  toInstant(START, dayIndex * 1440 + hh * 60 + mm, TZ);

describe("decideState — PRD F5 state table", () => {
  const base = {
    timeLoadPct: 50,
    overrunMinutes: 0,
    protectedInfeasible: false,
    lesserInfeasible: false,
    physicalWarning: false,
    returnBreached: false,
  };

  it("is comfortable at or below 80% with everything fitting", () => {
    expect(decideState({ ...base, timeLoadPct: 80 })).toBe("comfortable");
  });

  it("is tight just above 80%", () => {
    expect(decideState({ ...base, timeLoadPct: 81 })).toBe("tight");
  });

  it("is tight on a physical-load warning even when the day is nearly empty", () => {
    expect(decideState({ ...base, timeLoadPct: 10, physicalWarning: true })).toBe("tight");
  });

  it("is at risk when the day overruns by up to an hour", () => {
    expect(decideState({ ...base, timeLoadPct: 104, overrunMinutes: 60 })).toBe("at_risk");
  });

  it("is at risk on an IMPORTANT or OPTIONAL flag", () => {
    expect(decideState({ ...base, lesserInfeasible: true })).toBe("at_risk");
  });

  it("is broken past an hour of overrun", () => {
    expect(decideState({ ...base, overrunMinutes: 61 })).toBe("broken");
  });

  it("is broken when a PROTECTED item cannot happen, however light the day", () => {
    expect(decideState({ ...base, timeLoadPct: 5, protectedInfeasible: true })).toBe("broken");
  });

  it("is broken when the return guard is breached, whatever else is true", () => {
    expect(decideState({ ...base, timeLoadPct: 5, returnBreached: true })).toBe("broken");
  });
});

describe("computeHealth", () => {
  it("reports comfortable and no causes for a light day", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 120 })],
    });

    expect(report.journeyState).toBe("comfortable");
    expect(report.days).toHaveLength(1);
    expect(report.days[0]!.timeLoadPct).toBe(13);
    expect(report.days[0]!.causes).toEqual([]);
  });

  it("counts items, travel and buffers into the time load", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      travel_estimates: [
        { from_place_id: "p1", to_place_id: "p2", mode: "vehicle", duration_seconds: 1800 },
      ],
    };

    const report = computeHealth({
      journey,
      knowledge,
      items: [
        item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 300 }),
        item({
          id: "b",
          sort_order: 1,
          place_id: "p2",
          duration_likely_minutes: 300,
          buffer_minutes: 15,
        }),
      ],
    });

    // 600 items + 30 travel + 15 buffer = 645 of 900.
    expect(report.days[0]!.timeLoadPct).toBe(72);
  });

  it("names the overrun in minutes rather than as a score", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 950 })],
    });

    const cause = report.days[0]!.causes.find((c) => c.check === "time_load");
    expect(cause).toEqual({
      check: "time_load",
      key: "health.cause.day_overruns",
      params: { minutes: 50 },
    });
    expect(report.journeyState).toBe("at_risk");
  });

  it("returns i18n keys, never rendered sentences", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 1000 })],
    });

    for (const cause of report.days[0]!.causes) {
      expect(cause.key).toMatch(/^health\.(cause|trust)\./);
      expect(cause.key).not.toMatch(/\s/);
    }
  });

  it("takes the journey state from its worst day, not an average", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, day_index: 0, duration_likely_minutes: 60 }),
        item({ id: "b", sort_order: 0, day_index: 1, duration_likely_minutes: 60 }),
        item({ id: "c", sort_order: 0, day_index: 2, duration_likely_minutes: 1200 }),
      ],
    });

    expect(report.days.map((d) => d.state)).toEqual(["comfortable", "comfortable", "broken"]);
    expect(report.journeyState).toBe("broken");
  });

  describe("availability fit", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", duration_likely_minutes: 60 }],
      availability_rules: [
        {
          id: "r1",
          experience_id: "e1",
          kind: "daily_fixed_times",
          daily_times: [{ start: "04:00", end: "05:00" }],
          priority: 1,
        },
      ],
    };

    it("breaks the day when a PROTECTED item sits outside its availability", () => {
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
          }),
        ],
      });

      expect(report.days[0]!.state).toBe("broken");
      expect(report.days[0]!.causes).toContainEqual({
        check: "availability",
        key: "health.cause.outside_availability",
        params: { at: "10:00" },
        itemId: "a",
      });
    });

    it("only puts the day at risk when the item is OPTIONAL", () => {
      const report = computeHealth({
        journey,
        knowledge,
        items: [
          item({
            id: "a",
            sort_order: 0,
            tier: "optional",
            experience_id: "e1",
            duration_likely_minutes: 60,
            planned_start_at: on(10),
          }),
        ],
      });

      expect(report.days[0]!.state).toBe("at_risk");
    });

    it("passes an item that sits inside its window", () => {
      // 04:00–05:00 exactly fills the 04:00–05:00 window. A 04:30 start would run past
      // closing, which audit-fixes.test.ts asserts is a problem.
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
            planned_start_at: on(4, 0),
          }),
        ],
      });

      expect(report.days[0]!.causes).toEqual([]);
      expect(report.days[0]!.state).toBe("comfortable");
    });
  });

  it("flags a dependency scheduled before the thing it depends on", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 60, planned_start_at: on(9) }),
        item({ id: "b", sort_order: 1, duration_likely_minutes: 60, planned_start_at: on(7) }),
      ],
      dependencies: [{ item_id: "b", after_item_id: "a" }],
    });

    expect(report.days[0]!.causes).toContainEqual({
      check: "dependency",
      key: "health.cause.dependency_broken",
      itemId: "b",
    });
    expect(report.days[0]!.state).toBe("at_risk");
  });

  it("ignores a dependency whose items are not both scheduled", () => {
    const report = computeHealth({
      journey,
      knowledge: emptyKnowledge,
      items: [
        item({ id: "a", sort_order: 0, duration_likely_minutes: 60, planned_start_at: on(9) }),
      ],
      dependencies: [{ item_id: "a", after_item_id: "ghost" }],
    });

    expect(report.days[0]!.causes).toEqual([]);
  });

  describe("physical load (PRD-HLTH-005)", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      travel_estimates: [
        { from_place_id: "p1", to_place_id: "p2", mode: "walk", distance_m: 3100 },
      ],
    };

    const walkingDay: JourneyItem[] = [
      item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 30 }),
      item({
        id: "b",
        sort_order: 1,
        place_id: "p2",
        travel_mode: "walk",
        duration_likely_minutes: 30,
      }),
    ];

    it("warns when walking passes the most constrained traveler's limit", () => {
      const travelers: TravelerProfile[] = [
        { id: "t1", mobility: "full", age_band: "adult" },
        { id: "t2", mobility: "limited_walking", age_band: "senior" },
      ];

      const report = computeHealth({ journey, knowledge, items: walkingDay, travelers });

      expect(report.days[0]!.state).toBe("tight");
      expect(report.days[0]!.causes).toContainEqual({
        check: "physical_load",
        key: "health.cause.walking_over_limit",
        params: { metres: 3100, limitMetres: 2000 },
      });
    });

    it("stays quiet when everyone in the group walks freely", () => {
      const report = computeHealth({
        journey,
        knowledge,
        items: walkingDay,
        travelers: [{ id: "t1", mobility: "full", age_band: "adult" }],
      });

      expect(report.days[0]!.causes).toEqual([]);
    });

    it("counts no walking distance it has no estimate for", () => {
      const report = computeHealth({
        journey,
        knowledge: emptyKnowledge,
        items: walkingDay,
        travelers: [{ id: "t2", mobility: "limited_walking", age_band: "adult" }],
      });

      expect(report.days[0]!.causes).toEqual([]);
    });

    it("judges a wheelchair user on step-free access, not on metres", () => {
      const report = computeHealth({
        journey,
        knowledge: { ...knowledge, places: [{ id: "p1" }, { id: "p2", step_free: "yes" }] },
        items: [walkingDay[1]!],
        travelers: [{ id: "t1", mobility: "wheelchair", age_band: "adult" }],
      });

      // 3.1 km of wheeling is not the constraint; a step is.
      expect(report.days[0]!.causes).toEqual([]);
    });

    it("flags a place that is not step-free", () => {
      const report = computeHealth({
        journey,
        knowledge: { ...emptyKnowledge, places: [{ id: "p1", step_free: "no" }] },
        items: [item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 30 })],
        travelers: [{ id: "t1", mobility: "wheelchair", age_band: "adult" }],
      });

      expect(report.days[0]!.state).toBe("tight");
      expect(report.days[0]!.causes).toContainEqual({
        check: "physical_load",
        key: "health.cause.not_step_free",
        itemId: "a",
      });
    });

    it("keeps 'partial' as its own answer rather than rounding it", () => {
      const report = computeHealth({
        journey,
        knowledge: { ...emptyKnowledge, places: [{ id: "p1", step_free: "partial" }] },
        items: [item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 30 })],
        travelers: [{ id: "t1", mobility: "wheelchair", age_band: "adult" }],
      });

      expect(report.days[0]!.causes).toContainEqual({
        check: "physical_load",
        key: "health.cause.partly_step_free",
        itemId: "a",
      });
    });

    it("says when step-free access is unrecorded rather than assuming it", () => {
      const report = computeHealth({
        journey,
        knowledge: { ...emptyKnowledge, places: [{ id: "p1" }] },
        items: [item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 30 })],
        travelers: [{ id: "t1", mobility: "wheelchair", age_band: "adult" }],
      });

      expect(report.days[0]!.causes).toContainEqual({
        check: "physical_load",
        key: "health.cause.step_free_unknown",
        itemId: "a",
      });
    });

    it("says nothing about step-free access when nobody in the group needs it", () => {
      const report = computeHealth({
        journey,
        knowledge: { ...emptyKnowledge, places: [{ id: "p1", step_free: "no" }] },
        items: [item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 30 })],
        travelers: [{ id: "t1", mobility: "limited_walking", age_band: "senior" }],
      });

      expect(report.days[0]!.causes).toEqual([]);
    });

    describe("rest cadence", () => {
      const needsRest: TravelerProfile[] = [
        { id: "t1", mobility: "needs_rest_frequently", age_band: "senior" },
      ];

      it("flags a stretch longer than 90 minutes with no break in it", () => {
        const report = computeHealth({
          journey,
          knowledge: emptyKnowledge,
          items: [
            item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
            item({ id: "b", sort_order: 1, duration_likely_minutes: 60 }),
          ],
          travelers: needsRest,
        });

        expect(report.days[0]!.state).toBe("tight");
        expect(report.days[0]!.causes).toContainEqual({
          check: "physical_load",
          key: "health.cause.no_rest_in_stretch",
          params: { minutes: 120, intervalMinutes: 90 },
        });
      });

      it("accepts a real break between the two", () => {
        const report = computeHealth({
          journey,
          knowledge: emptyKnowledge,
          items: [
            item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
            item({
              id: "rest",
              sort_order: 1,
              item_type: "rest",
              duration_likely_minutes: 20,
            }),
            item({ id: "b", sort_order: 2, duration_likely_minutes: 60 }),
          ],
          travelers: needsRest,
        });

        expect(report.days[0]!.causes).toEqual([]);
      });

      it("does not count a five-minute pause as a break", () => {
        const report = computeHealth({
          journey,
          knowledge: emptyKnowledge,
          items: [
            item({ id: "a", sort_order: 0, duration_likely_minutes: 60 }),
            item({ id: "tea", sort_order: 1, item_type: "meal", duration_likely_minutes: 5 }),
            item({ id: "b", sort_order: 2, duration_likely_minutes: 60 }),
          ],
          travelers: needsRest,
        });

        expect(report.days[0]!.causes.map((c) => c.key)).toContain(
          "health.cause.no_rest_in_stretch",
        );
      });

      it("counts travel between items into the stretch", () => {
        const report = computeHealth({
          journey,
          knowledge: {
            ...emptyKnowledge,
            travel_estimates: [
              { from_place_id: "p1", to_place_id: "p2", mode: "vehicle", duration_seconds: 3600 },
            ],
          },
          items: [
            item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 20 }),
            item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 20 }),
          ],
          travelers: needsRest,
        });

        // 20 + 60 of travel + 20 = 100 minutes without sitting down.
        expect(report.days[0]!.causes).toContainEqual({
          check: "physical_load",
          key: "health.cause.no_rest_in_stretch",
          params: { minutes: 100, intervalMinutes: 90 },
        });
      });

      it("says nothing when nobody in the group needs frequent rest", () => {
        const report = computeHealth({
          journey,
          knowledge: emptyKnowledge,
          items: [
            item({ id: "a", sort_order: 0, duration_likely_minutes: 300 }),
            item({ id: "b", sort_order: 1, duration_likely_minutes: 300 }),
          ],
          travelers: [{ id: "t1", mobility: "full", age_band: "adult" }],
        });

        expect(report.days[0]!.causes).toEqual([]);
      });
    });
  });

  describe("trust exposure", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      trust: {
        e1: {
          entry_fee: {
            confidence: "low",
            freshness: "stale",
            conflict_flag: false,
          },
        },
        p1: {
          opening_schedule: {
            confidence: "high",
            freshness: "fresh",
            conflict_flag: true,
          },
        },
      },
    };

    it("counts low-confidence and conflicting fields separately", () => {
      const report = computeHealth({
        journey,
        knowledge,
        items: [
          item({
            id: "a",
            sort_order: 0,
            experience_id: "e1",
            place_id: "p1",
            duration_likely_minutes: 60,
          }),
        ],
      });

      expect(report.days[0]!.trustExposure).toEqual([
        { key: "health.trust.unverified", count: 1 },
        { key: "health.trust.conflicting", count: 1 },
      ]);
    });

    it("does not let trust exposure change the health state", () => {
      const report = computeHealth({
        journey,
        knowledge,
        items: [
          item({
            id: "a",
            sort_order: 0,
            experience_id: "e1",
            place_id: "p1",
            duration_likely_minutes: 60,
          }),
        ],
      });

      // Unverified information is a different kind of problem from a day that will not fit.
      expect(report.days[0]!.state).toBe("comfortable");
    });

    it("counts a field edited since it was verified as unverified", () => {
      // What the traveler sees over it is "Check locally"; Health must not call the same
      // day fully verified.
      const report = computeHealth({
        journey,
        knowledge: {
          ...emptyKnowledge,
          trust: {
            p1: {
              opening_schedule: {
                confidence: "high",
                freshness: "fresh",
                conflict_flag: false,
                needs_reverification: true,
              },
            },
          },
        },
        items: [item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 60 })],
      });

      expect(report.days[0]!.trustExposure).toEqual([{ key: "health.trust.unverified", count: 1 }]);
    });

    it("is empty when the bundle carries no trust records", () => {
      const report = computeHealth({
        journey,
        knowledge: emptyKnowledge,
        items: [item({ id: "a", sort_order: 0, duration_likely_minutes: 60 })],
      });

      expect(report.days[0]!.trustExposure).toEqual([]);
    });
  });

  it("breaks the day when the return guard is breached", () => {
    const report = computeHealth({
      journey,
      knowledge: {
        ...emptyKnowledge,
        travel_estimates: [
          { from_place_id: "p1", to_place_id: "station", mode: "vehicle", duration_seconds: 5400 },
        ],
      },
      items: [
        item({
          id: "a",
          sort_order: 0,
          place_id: "p1",
          duration_likely_minutes: 60,
          planned_end_at: on(17, 30),
        }),
        item({
          id: "return",
          sort_order: 1,
          tier: "fixed",
          item_type: "fixed_commitment",
          place_id: "station",
          travel_mode: "vehicle",
          fixed_start_at: on(18),
        }),
      ],
    });

    expect(report.days[0]!.state).toBe("broken");
    expect(report.days[0]!.causes.map((c) => c.check)).toContain("return_guard");
  });

  it("returns no days for a journey with no items", () => {
    const report = computeHealth({ journey, knowledge: emptyKnowledge, items: [] });

    expect(report.days).toEqual([]);
    expect(report.journeyState).toBe("comfortable");
  });
});
