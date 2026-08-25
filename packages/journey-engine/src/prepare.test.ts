import { describe, expect, it } from "vitest";
import { generatePrepareTasks } from "./prepare";
import type { Journey, JourneyItem, KnowledgeBundle, TravelerProfile } from "./types";

const journey: Journey = {
  id: "j1",
  start_date: "2026-10-12",
  timezone: "Asia/Kolkata",
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

const item = (over: Partial<JourneyItem> & { id: string }): JourneyItem => ({
  day_index: 0,
  sort_order: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

describe("generatePrepareTasks", () => {
  it("raises a booking task for an experience that needs booking ahead", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [
        {
          id: "e1",
          advance_booking_required: true,
          advance_booking_how: "Book on the TTD portal.",
          advance_booking_opens_days_before: 60,
        },
      ],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [item({ id: "i1", experience_id: "e1", day_index: 2 })],
    });

    expect(tasks).toContainEqual({
      id: "booking:i1",
      group: "bookings",
      titleKey: "prepare.booking.title",
      params: { experienceId: "e1" },
      body: "Book on the TTD portal.",
      sourceItemId: "i1",
      trustRef: { entityId: "e1", field: "advance_booking_required" },
      // 2026-10-14 minus 60 days.
      dueDate: "2026-08-15",
    });
  });

  /**
   * PRD F7's acceptance criterion, in its own words: "A journey with 3 advance-booking
   * experiences produces 3 dated booking tasks with instructions."
   *
   * Asserted here rather than end-to-end because the fixture destination carries one
   * bookable experience, and inventing two more in the seed to satisfy a test would
   * change what every other fixture assertion is counting.
   */
  it("turns three advance-booking experiences into three dated tasks with instructions", () => {
    const bookable = [1, 2, 3].map((n) => ({
      id: `e${n}`,
      advance_booking_required: true,
      advance_booking_how: `Book number ${n} at the counter.`,
      advance_booking_opens_days_before: 30 * n,
    }));

    const tasks = generatePrepareTasks({
      journey,
      knowledge: { ...emptyKnowledge, experiences: bookable },
      items: bookable.map((experience, index) =>
        item({ id: `i${index + 1}`, experience_id: experience.id, day_index: index }),
      ),
    });

    const bookings = tasks.filter((task) => task.group === "bookings");

    expect(bookings).toHaveLength(3);
    // "Dated" and "with instructions" are the two halves that make the task actionable —
    // a booking reminder with no deadline and no how-to is just anxiety.
    expect(bookings.every((task) => !!task.dueDate)).toBe(true);
    expect(bookings.map((task) => task.body)).toEqual([
      "Book number 1 at the counter.",
      "Book number 2 at the counter.",
      "Book number 3 at the counter.",
    ]);

    // Each counts back from ITS OWN day, not from the journey's start.
    expect(bookings.map((task) => task.dueDate)).toEqual([
      "2026-09-12", // day 0, 30 days before
      "2026-08-14", // day 1, 60 days before
      "2026-07-16", // day 2, 90 days before
    ]);
  });

  it("falls back to the day itself when no booking lead time is recorded", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", advance_booking_required: true }],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [item({ id: "i1", experience_id: "e1", day_index: 1 })],
    });

    const booking = tasks.find((t) => t.group === "bookings");
    expect(booking?.dueDate).toBe("2026-10-13");
    expect(booking?.body).toBeUndefined();
  });

  it("raises nothing for an experience that needs no booking", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", advance_booking_required: false }],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [item({ id: "i1", experience_id: "e1" })],
    });

    expect(tasks.filter((t) => t.group === "bookings")).toEqual([]);
  });

  it("carries dress code and entry requirements through verbatim", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      places: [
        {
          id: "p1",
          dress_code: "Traditional dress; no footwear inside.",
          entry_requirements: "Carry photo ID for every traveler.",
        },
      ],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [item({ id: "i1", place_id: "p1" })],
    });

    expect(tasks.find((t) => t.group === "know")?.body).toBe(
      "Traditional dress; no footwear inside.",
    );
    expect(tasks.find((t) => t.group === "carry")?.body).toBe("Carry photo ID for every traveler.");
  });

  it("says the same thing once, however many places repeat it", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      places: [
        { id: "p1", entry_requirements: "Carry photo ID." },
        { id: "p2", entry_requirements: "Carry photo ID." },
        { id: "p3", entry_requirements: "Carry photo ID." },
      ],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [
        item({ id: "i1", place_id: "p1" }),
        item({ id: "i2", place_id: "p2" }),
        item({ id: "i3", place_id: "p3" }),
      ],
    });

    expect(tasks.filter((t) => t.group === "carry")).toHaveLength(1);
  });

  it("adds nothing the journey does not contain", () => {
    const tasks = generatePrepareTasks({ journey, knowledge: emptyKnowledge, items: [] });

    // Only the offline download, which is true of every journey (PRD F11).
    expect(tasks.map((t) => t.group)).toEqual(["downloads"]);
  });

  it("ignores an item whose place or experience is not in the bundle", () => {
    const tasks = generatePrepareTasks({
      journey,
      knowledge: emptyKnowledge,
      items: [item({ id: "i1", place_id: "ghost", experience_id: "ghost" })],
    });

    expect(tasks.map((t) => t.group)).toEqual(["downloads"]);
  });

  describe("for your travelers", () => {
    const travelers = (mobility: TravelerProfile["mobility"]): TravelerProfile[] => [
      { id: "t1", mobility: "full", age_band: "adult" },
      { id: "t2", mobility, age_band: "senior" },
    ];

    it("asks about step-free access only when someone needs it", () => {
      const withNeed = generatePrepareTasks({
        journey,
        knowledge: emptyKnowledge,
        items: [],
        travelers: travelers("wheelchair"),
      });
      const without = generatePrepareTasks({
        journey,
        knowledge: emptyKnowledge,
        items: [],
        travelers: travelers("full"),
      });

      expect(withNeed.map((t) => t.id)).toContain("travelers:step-free");
      expect(without.map((t) => t.id)).not.toContain("travelers:step-free");
    });

    it("asks about rest points for a traveler who needs them", () => {
      const tasks = generatePrepareTasks({
        journey,
        knowledge: emptyKnowledge,
        items: [],
        travelers: travelers("needs_rest_frequently"),
      });

      expect(tasks.map((t) => t.id)).toContain("travelers:rest-points");
    });
  });

  it("gives every task a stable id, so a ticked box survives a rebuild", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", advance_booking_required: true }],
      places: [{ id: "p1", dress_code: "Traditional dress." }],
    };
    const items = [item({ id: "i1", experience_id: "e1", place_id: "p1" })];

    const first = generatePrepareTasks({ journey, knowledge, items });
    const second = generatePrepareTasks({ journey, knowledge, items });

    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
    expect(new Set(first.map((t) => t.id)).size).toBe(first.length);
  });

  it("titles tasks with i18n keys, never rendered sentences", () => {
    const knowledge: KnowledgeBundle = {
      ...emptyKnowledge,
      experiences: [{ id: "e1", advance_booking_required: true }],
      places: [{ id: "p1", dress_code: "Traditional dress." }],
    };

    const tasks = generatePrepareTasks({
      journey,
      knowledge,
      items: [item({ id: "i1", experience_id: "e1", place_id: "p1" })],
      travelers: [{ id: "t1", mobility: "wheelchair", age_band: "adult" }],
    });

    for (const task of tasks) {
      expect(task.titleKey).toMatch(/^prepare\.[a-z_]+\.[a-z_]+$/);
    }
  });
});
