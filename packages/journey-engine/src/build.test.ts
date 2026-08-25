import { describe, expect, it } from "vitest";
import { buildInitialJourney } from "./build";
import { fromInstant, toInstant } from "./time";
import type { JourneyBrief, KnowledgeBundle } from "./types";

const TZ = "Asia/Kolkata";
const START = "2026-10-12";

const emptyKnowledge: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const brief = (over: Partial<JourneyBrief> = {}): JourneyBrief => ({
  start_date: START,
  day_count: 3,
  timezone: TZ,
  ...over,
});

/** Minutes from local midnight on the item's own day, for readable assertions. */
const startMinutes = (iso: string | null | undefined, dayIndex: number) =>
  iso ? fromInstant(iso, `2026-10-${12 + dayIndex}`, TZ) : null;

const knowledge = (over: Partial<KnowledgeBundle> = {}): KnowledgeBundle => ({
  ...emptyKnowledge,
  ...over,
});

describe("buildInitialJourney", () => {
  it("derives the journey shell from the brief, with the documented defaults", () => {
    const { journey } = buildInitialJourney({
      brief: brief({ day_count: 3 }),
      knowledge: emptyKnowledge,
    });

    expect(journey.start_date).toBe(START);
    expect(journey.end_date).toBe("2026-10-14");
    expect(journey.timezone).toBe(TZ);
    expect(journey.day_start_time).toBe("06:00");
    expect(journey.day_end_time).toBe("21:00");
  });

  it("takes the day count from the dates when it is not given", () => {
    const { journey, items } = buildInitialJourney({
      brief: { start_date: START, end_date: "2026-10-15" },
      knowledge: knowledge({ experiences: [{ id: "e1", duration_likely_minutes: 60 }] }),
    });

    expect(journey.end_date).toBe("2026-10-15");
    expect(items).toHaveLength(0);
  });

  it("builds a single day when the brief carries neither a count nor an end date", () => {
    const { journey } = buildInitialJourney({
      brief: { start_date: START },
      knowledge: emptyKnowledge,
    });

    expect(journey.end_date).toBe(START);
  });

  it("adds nothing the traveler did not ask for", () => {
    const { items } = buildInitialJourney({
      brief: brief(),
      knowledge: knowledge({
        // A bundle full of tempting content the brief never mentioned.
        experiences: [
          { id: "e1", duration_likely_minutes: 60 },
          { id: "e2", duration_likely_minutes: 60 },
          { id: "e3", duration_likely_minutes: 60 },
        ],
        places: [{ id: "p1", visit_duration_likely_minutes: 60 }],
      }),
    });

    expect(items).toEqual([]);
  });

  it("maps the brief's three lists onto their tiers", () => {
    const { items } = buildInitialJourney({
      brief: brief({
        must_do: [{ experience_id: "e1" }],
        would_like: [{ experience_id: "e2" }],
        might_do: [{ experience_id: "e3" }],
      }),
      knowledge: knowledge({
        experiences: [
          { id: "e1", duration_likely_minutes: 60 },
          { id: "e2", duration_likely_minutes: 60 },
          { id: "e3", duration_likely_minutes: 60 },
        ],
      }),
    });

    const tierOf = (experienceId: string) =>
      items.find((i) => i.experience_id === experienceId)?.tier;

    expect(tierOf("e1")).toBe("protected");
    expect(tierOf("e2")).toBe("important");
    expect(tierOf("e3")).toBe("optional");
  });

  it("anchors a fixed commitment on the day it actually falls, at its own time", () => {
    const returnAt = toInstant(START, 2 * 1440 + 18 * 60, TZ);

    const { items } = buildInitialJourney({
      brief: brief({
        fixed_commitments: [{ at: returnAt, place_id: "station" }],
      }),
      knowledge: emptyKnowledge,
    });

    expect(items).toHaveLength(1);
    expect(items[0]!.day_index).toBe(2);
    expect(items[0]!.tier).toBe("fixed");
    expect(items[0]!.item_type).toBe("fixed_commitment");
    expect(startMinutes(items[0]!.planned_start_at, 2)).toBe(18 * 60);
  });

  it("keeps a fixed commitment dated past the journey rather than discarding it", () => {
    // A brief the traveler can still fix beats a blank screen.
    const { items } = buildInitialJourney({
      brief: brief({
        day_count: 2,
        fixed_commitments: [{ at: toInstant(START, 5 * 1440 + 18 * 60, TZ) }],
      }),
      knowledge: emptyKnowledge,
    });

    expect(items).toHaveLength(1);
    expect(items[0]!.day_index).toBe(1);
  });

  it("gives a fixed commitment with an end time a duration", () => {
    const { items } = buildInitialJourney({
      brief: brief({
        fixed_commitments: [
          { at: toInstant(START, 9 * 60, TZ), end_at: toInstant(START, 11 * 60 + 30, TZ) },
        ],
      }),
      knowledge: emptyKnowledge,
    });

    expect(items[0]!.duration_likely_minutes).toBe(150);
  });

  describe("day packing", () => {
    const sixHourExperiences = knowledge({
      experiences: [
        { id: "e1", duration_likely_minutes: 360 },
        { id: "e2", duration_likely_minutes: 360 },
        { id: "e3", duration_likely_minutes: 360 },
      ],
    });

    it("spreads items across days once the pace target for a day is met", () => {
      // 900-minute window; balanced targets 720. Two 360s fill day 0 exactly.
      const { items } = buildInitialJourney({
        brief: brief({
          pace: "balanced",
          must_do: [{ experience_id: "e1" }, { experience_id: "e2" }, { experience_id: "e3" }],
        }),
        knowledge: sixHourExperiences,
      });

      expect(items.map((i) => i.day_index)).toEqual([0, 0, 1]);
    });

    it("leaves more room per day on a relaxed pace", () => {
      // relaxed targets 540, so a single 360 already fills a day.
      const { items } = buildInitialJourney({
        brief: brief({
          pace: "relaxed",
          must_do: [{ experience_id: "e1" }, { experience_id: "e2" }, { experience_id: "e3" }],
        }),
        knowledge: sixHourExperiences,
      });

      expect(items.map((i) => i.day_index)).toEqual([0, 1, 2]);
    });

    it("keeps everything, placing overflow on the least-loaded day", () => {
      const { items } = buildInitialJourney({
        brief: brief({
          day_count: 1,
          pace: "relaxed",
          must_do: [{ experience_id: "e1" }, { experience_id: "e2" }, { experience_id: "e3" }],
        }),
        knowledge: sixHourExperiences,
      });

      expect(items).toHaveLength(3);
      expect(items.every((i) => i.day_index === 0)).toBe(true);
    });

    it("reports the resulting overload as health rather than silently trimming it", () => {
      const { items, health } = buildInitialJourney({
        brief: brief({
          day_count: 1,
          must_do: [{ experience_id: "e1" }, { experience_id: "e2" }, { experience_id: "e3" }],
        }),
        knowledge: sixHourExperiences,
      });

      expect(items).toHaveLength(3);
      expect(health.journeyState).toBe("broken");
      expect(health.days[0]!.causes.map((c) => c.check)).toContain("time_load");
    });

    it("gives PROTECTED items the room before IMPORTANT ones", () => {
      const { items } = buildInitialJourney({
        brief: brief({
          day_count: 2,
          pace: "relaxed",
          would_like: [{ experience_id: "e1" }],
          must_do: [{ experience_id: "e2" }],
        }),
        knowledge: sixHourExperiences,
      });

      const dayOf = (id: string) => items.find((i) => i.experience_id === id)?.day_index;
      expect(dayOf("e2")).toBe(0);
      expect(dayOf("e1")).toBe(1);
    });

    it("honours a day the traveler pinned themselves", () => {
      const { items } = buildInitialJourney({
        brief: brief({
          must_do: [{ experience_id: "e1", day_index: 2 }],
        }),
        knowledge: sixHourExperiences,
      });

      expect(items[0]!.day_index).toBe(2);
    });

    it("clamps a pinned day that falls outside the journey", () => {
      const { items } = buildInitialJourney({
        brief: brief({ day_count: 2, must_do: [{ experience_id: "e1", day_index: 9 }] }),
        knowledge: sixHourExperiences,
      });

      expect(items[0]!.day_index).toBe(1);
    });
  });

  describe("availability", () => {
    const weekendOnly = knowledge({
      experiences: [{ id: "e1", duration_likely_minutes: 60 }],
      availability_rules: [
        {
          id: "r1",
          experience_id: "e1",
          kind: "weekly_pattern",
          // 2026-10-12 is a Monday; the first Saturday is day 5.
          weekly_pattern: { sat: [{ start: "09:00", end: "12:00" }] },
          priority: 1,
        },
      ],
    });

    it("places an item on a day it can actually happen, not simply the first one", () => {
      const { items, warnings } = buildInitialJourney({
        brief: brief({ day_count: 7, must_do: [{ experience_id: "e1" }] }),
        knowledge: weekendOnly,
      });

      expect(items[0]!.day_index).toBe(5);
      expect(startMinutes(items[0]!.planned_start_at, 5)).toBe(9 * 60);
      expect(warnings).toEqual([]);
    });

    it("still places an item available on no day at all, and says so", () => {
      const { items, warnings } = buildInitialJourney({
        brief: brief({ day_count: 3, must_do: [{ experience_id: "e1" }] }),
        knowledge: weekendOnly,
      });

      expect(items).toHaveLength(1);
      expect(warnings.map((w) => w.code)).toContain("outside_availability");
    });

    it("orders a day by when things can happen, not by the order they were named", () => {
      const { items } = buildInitialJourney({
        brief: brief({
          day_count: 1,
          must_do: [{ experience_id: "afternoon" }, { experience_id: "dawn" }],
        }),
        knowledge: knowledge({
          experiences: [
            { id: "dawn", duration_likely_minutes: 60 },
            { id: "afternoon", duration_likely_minutes: 60 },
          ],
          availability_rules: [
            {
              id: "r1",
              experience_id: "dawn",
              kind: "daily_fixed_times",
              daily_times: [{ start: "06:30", end: "07:30" }],
              priority: 1,
            },
            {
              id: "r2",
              experience_id: "afternoon",
              kind: "daily_fixed_times",
              daily_times: [{ start: "15:00", end: "17:00" }],
              priority: 1,
            },
          ],
        }),
      });

      expect(items.map((i) => i.experience_id)).toEqual(["dawn", "afternoon"]);
      expect(items.map((i) => i.sort_order)).toEqual([0, 1]);
    });

    it("respects a preferred window the traveler set", () => {
      const { items } = buildInitialJourney({
        brief: brief({
          day_count: 1,
          must_do: [{ experience_id: "e1", preferred_window_start: "16:00" }],
        }),
        knowledge: knowledge({ experiences: [{ id: "e1", duration_likely_minutes: 60 }] }),
      });

      expect(items[0]!.preferred_window_start).toBe("16:00");
      expect(startMinutes(items[0]!.planned_start_at, 0)).toBe(16 * 60);
    });
  });

  it("copies the place through from the experience so travel can be costed", () => {
    const { items } = buildInitialJourney({
      brief: brief({ day_count: 1, must_do: [{ experience_id: "e1" }] }),
      knowledge: knowledge({
        experiences: [{ id: "e1", place_id: "p1", duration_likely_minutes: 60 }],
        places: [{ id: "p1" }],
      }),
    });

    expect(items[0]!.place_id).toBe("p1");
  });

  it("takes a duration from the place when the experience does not record one", () => {
    const { items } = buildInitialJourney({
      brief: brief({ day_count: 1, must_do: [{ experience_id: "e1" }] }),
      knowledge: knowledge({
        experiences: [{ id: "e1", place_id: "p1" }],
        places: [{ id: "p1", visit_duration_likely_minutes: 45 }],
      }),
    });

    expect(items[0]!.duration_likely_minutes).toBe(45);
  });

  it("invents no duration where none is recorded, and warns instead", () => {
    const { items, warnings } = buildInitialJourney({
      brief: brief({ day_count: 1, must_do: [{ experience_id: "e1" }] }),
      knowledge: knowledge({ experiences: [{ id: "e1" }] }),
    });

    expect(items[0]!.duration_likely_minutes).toBeNull();
    expect(items[0]!.planned_start_at).toBeNull();
    expect(warnings.map((w) => w.code)).toContain("no_duration");
  });

  it("produces identical output for identical input", () => {
    const input = {
      brief: brief({
        must_do: [{ experience_id: "e1" }, { experience_id: "e2" }],
        fixed_commitments: [{ at: toInstant(START, 2 * 1440 + 18 * 60, TZ) }],
      }),
      knowledge: knowledge({
        experiences: [
          { id: "e1", duration_likely_minutes: 120 },
          { id: "e2", duration_likely_minutes: 120 },
        ],
      }),
    };

    expect(buildInitialJourney(input)).toEqual(buildInitialJourney(input));
  });

  it("builds the PRD F3 worked example into a journey the traveler recognises", () => {
    // "3 days in Tirumala with my parents. Amma can't walk much. Suprabhatam darshan is
    // the one thing we must do. Return train on Sunday 6 PM from Tirupati."
    const result = buildInitialJourney({
      brief: {
        start_date: START,
        day_count: 3,
        timezone: TZ,
        pace: "relaxed",
        must_do: [{ experience_id: "suprabhatam" }],
        fixed_commitments: [
          { at: toInstant(START, 2 * 1440 + 18 * 60, TZ), place_id: "tirupati-station" },
        ],
      },
      knowledge: knowledge({
        places: [{ id: "tirumala-temple" }, { id: "tirupati-station" }],
        experiences: [
          { id: "suprabhatam", place_id: "tirumala-temple", duration_likely_minutes: 90 },
        ],
        availability_rules: [
          {
            id: "r1",
            experience_id: "suprabhatam",
            kind: "daily_fixed_times",
            daily_times: [{ start: "03:00", end: "04:30" }],
            priority: 1,
          },
        ],
      }),
      travelers: [
        { id: "me", mobility: "full", age_band: "adult" },
        { id: "amma", mobility: "limited_walking", age_band: "senior" },
        { id: "nanna", mobility: "full", age_band: "senior" },
      ],
    });

    expect(result.items).toHaveLength(2);

    const darshan = result.items.find((i) => i.experience_id === "suprabhatam")!;
    expect(darshan.tier).toBe("protected");
    expect(darshan.day_index).toBe(0);

    const train = result.items.find((i) => i.tier === "fixed")!;
    expect(train.day_index).toBe(2);
    expect(startMinutes(train.planned_start_at, 2)).toBe(18 * 60);

    // The 03:00 slot sits before the 06:00 day start, so the day cannot hold it as
    // planned. The engine places it anyway and says so — the traveler decides.
    expect(result.health.days[0]!.state).not.toBe("comfortable");
  });
});
