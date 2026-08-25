import { describe, expect, it } from "vitest";
import {
  applyWeeklyCap,
  NOTIFICATION_DEFAULTS,
  scheduleNotifications,
  type NotificationDraft,
} from "./notify";
import type { PrepareTask } from "./prepare";
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

const item = (over: Partial<JourneyItem> & { id: string; sort_order: number }): JourneyItem => ({
  day_index: 0,
  item_type: "experience",
  tier: "important",
  ...over,
});

/** Well before the journey, so nothing is filtered for being in the past. */
const WELL_BEFORE = toInstant("2026-08-01", 9 * 60, TZ);

const day = () =>
  scheduleDay({
    journey,
    dayIndex: 0,
    knowledge,
    items: [
      item({ id: "a", sort_order: 0, place_id: "p1", duration_likely_minutes: 120 }),
      item({ id: "b", sort_order: 1, place_id: "p2", duration_likely_minutes: 60 }),
    ],
  }).items;

const localMinutes = (iso: string, date = START) => fromInstant(iso, date, TZ);
const localDate = (iso: string) =>
  new Date(Date.parse(iso) + 5.5 * 3600_000).toISOString().slice(0, 10);

describe("scheduleNotifications", () => {
  it("reminds the traveler the evening before, at 6pm their time", () => {
    const drafts = scheduleNotifications({ journey, items: [], now: WELL_BEFORE });
    const tomorrow = drafts.find((d) => d.type === "journey_tomorrow")!;

    expect(localDate(tomorrow.scheduledFor)).toBe("2026-10-11");
    expect(localMinutes(tomorrow.scheduledFor, "2026-10-11")).toBe(18 * 60);
  });

  it("counts back from each item through its buffer and 15 minutes", () => {
    const drafts = scheduleNotifications({ journey, items: day(), now: WELL_BEFORE });
    const leaveBy = drafts.filter((d) => d.type === "leave_by");

    // b starts 08:45; less its 15-minute buffer, less 15 minutes' notice.
    expect(leaveBy).toHaveLength(1);
    expect(localMinutes(leaveBy[0]!.scheduledFor)).toBe(8 * 60 + 15);
    expect(leaveBy[0]!.itemId).toBe("b");
  });

  it("does not tell anyone to leave for where they already are", () => {
    const drafts = scheduleNotifications({ journey, items: day(), now: WELL_BEFORE });

    // The first item of the day has nothing to leave from.
    expect(drafts.some((d) => d.itemId === "a")).toBe(false);
  });

  it("reminds about a booking deadline at 7 days and 1 day", () => {
    const tasks: PrepareTask[] = [
      {
        id: "booking:i1",
        group: "bookings",
        titleKey: "prepare.booking.title",
        dueDate: "2026-09-15",
      },
    ];

    const drafts = scheduleNotifications({
      journey,
      items: [],
      prepareTasks: tasks,
      now: WELL_BEFORE,
    });

    const prepare = drafts.filter((d) => d.type === "prepare_deadline");
    expect(prepare.map((d) => localDate(d.scheduledFor))).toEqual(["2026-09-08", "2026-09-14"]);
    // 09:00 local: early enough to act on the same day, late enough not to wake anyone.
    expect(localMinutes(prepare[0]!.scheduledFor, "2026-09-08")).toBe(9 * 60);
  });

  it("says nothing about a task with no deadline", () => {
    const drafts = scheduleNotifications({
      journey,
      items: [],
      prepareTasks: [
        { id: "downloads:offline", group: "downloads", titleKey: "prepare.downloads.save_offline" },
      ],
      now: WELL_BEFORE,
    });

    expect(drafts.some((d) => d.type === "prepare_deadline")).toBe(false);
  });

  it("never schedules anything already in the past", () => {
    // A "leave in 15 minutes" that arrives an hour late is a prompt to hurry towards
    // something already missed.
    const drafts = scheduleNotifications({
      journey,
      items: day(),
      now: toInstant(START, 20 * 60, TZ),
    });

    expect(drafts).toEqual([]);
  });

  it("returns them in the order they will happen", () => {
    const drafts = scheduleNotifications({
      journey,
      items: day(),
      prepareTasks: [
        { id: "b1", group: "bookings", titleKey: "prepare.booking.title", dueDate: "2026-09-15" },
      ],
      now: WELL_BEFORE,
    });

    const times = drafts.map((d) => Date.parse(d.scheduledFor));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("gives every draft a stable key, so re-scheduling queues nothing twice", () => {
    const input = { journey, items: day(), now: WELL_BEFORE };

    const first = scheduleNotifications(input);
    const second = scheduleNotifications(input);

    expect(second.map((d) => d.dedupeKey)).toEqual(first.map((d) => d.dedupeKey));
    expect(new Set(first.map((d) => d.dedupeKey)).size).toBe(first.length);
  });

  it("carries i18n keys, never rendered sentences", () => {
    const drafts = scheduleNotifications({ journey, items: day(), now: WELL_BEFORE });

    for (const draft of drafts) {
      expect(draft.titleKey).toMatch(/^notify\.[a-z_]+\.title$/);
      expect(draft.bodyKey).toMatch(/^notify\.[a-z_]+\.body$/);
    }
  });

  describe("preferences", () => {
    it("honours PRD F15's defaults without being told them", () => {
      expect(NOTIFICATION_DEFAULTS.leave_by).toBe(true);
      // The only one off by default is also the only one that is not about the journey.
      expect(NOTIFICATION_DEFAULTS.suggestion).toBe(false);
    });

    it("sends nothing of a type the traveler switched off", () => {
      const drafts = scheduleNotifications({
        journey,
        items: day(),
        prefs: { leave_by: false, journey_tomorrow: false },
        now: WELL_BEFORE,
      });

      expect(drafts).toEqual([]);
    });

    it("switching one type off leaves the others alone", () => {
      const drafts = scheduleNotifications({
        journey,
        items: day(),
        prefs: { leave_by: false },
        now: WELL_BEFORE,
      });

      expect(drafts.map((d) => d.type)).toEqual(["journey_tomorrow"]);
    });
  });
});

describe("applyWeeklyCap", () => {
  const draft = (type: NotificationDraft["type"], date: string): NotificationDraft => ({
    dedupeKey: `${type}:${date}`,
    type,
    scheduledFor: `${date}T09:00:00+05:30`,
    titleKey: `notify.${type}.title`,
    bodyKey: `notify.${type}.body`,
    channel: "push",
  });

  it("never lets two non-journey notifications go out in the same week", () => {
    const kept = applyWeeklyCap(
      [
        draft("suggestion", "2026-09-01"),
        draft("suggestion", "2026-09-03"),
        draft("advisory", "2026-09-05"),
      ],
      null,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]!.scheduledFor).toContain("2026-09-01");
  });

  it("allows the next one once a week has passed", () => {
    const kept = applyWeeklyCap(
      [draft("suggestion", "2026-09-01"), draft("suggestion", "2026-09-09")],
      null,
    );

    expect(kept).toHaveLength(2);
  });

  it("counts the last one already sent, not just the ones in this batch", () => {
    const kept = applyWeeklyCap([draft("suggestion", "2026-09-03")], "2026-09-01T09:00:00+05:30");

    expect(kept).toEqual([]);
  });

  it("never caps a notification about the traveler's own journey", () => {
    // The cap exists to stop the product talking at people, not to stop it telling them
    // their train moved.
    const kept = applyWeeklyCap(
      [
        draft("leave_by", "2026-09-01"),
        draft("journey_change", "2026-09-01"),
        draft("prepare_deadline", "2026-09-02"),
        draft("report_resolved", "2026-09-02"),
      ],
      "2026-09-01T00:00:00+05:30",
    );

    expect(kept).toHaveLength(4);
  });
});
