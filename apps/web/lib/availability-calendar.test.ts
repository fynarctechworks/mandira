import type { AvailabilityRule } from "@mandhira/journey-engine";
import { describe, expect, it } from "vitest";

import { availabilityCalendar, CALENDAR_DAYS, calendarVaries } from "./availability-calendar";

const rule = (over: Partial<AvailabilityRule>): AvailabilityRule => ({
  id: "r1",
  experience_id: "e1",
  kind: "daily_fixed_times",
  daily_times: [{ start: "06:00", end: "07:30" }],
  weekly_pattern: null,
  date_start: null,
  date_end: null,
  calendar_dates: null,
  priority: 1,
  valid_from: null,
  valid_to: null,
  ...over,
});

// 2026-09-26 is a Saturday.
const SATURDAY = "2026-09-26";

describe("availabilityCalendar (PRD §5 A06)", () => {
  it("covers a fortnight, one row per day, from the day it is given", () => {
    const days = availabilityCalendar({ rules: [rule({})], openingSchedule: null, from: SATURDAY });

    expect(days).toHaveLength(CALENDAR_DAYS);
    expect(days[0]?.date).toBe(SATURDAY);
    expect(days[13]?.date).toBe("2026-10-09");
  });

  it("shows the times on a day it runs", () => {
    const [first] = availabilityCalendar({
      rules: [rule({})],
      openingSchedule: null,
      from: SATURDAY,
    });
    expect(first).toEqual({
      date: SATURDAY,
      available: true,
      windows: [{ start: "06:00", end: "07:30" }],
      reason: null,
    });
  });

  it("marks the days a weekly seva does NOT run — the question this exists to answer", () => {
    const days = availabilityCalendar({
      rules: [
        rule({
          kind: "weekly_pattern",
          daily_times: null,
          weekly_pattern: { sat: [{ start: "07:00", end: "08:00" }] },
        }),
      ],
      openingSchedule: null,
      from: SATURDAY,
    });

    const open = days.filter((day) => day.available).map((day) => day.date);
    // The two Saturdays in the fortnight, and nothing else.
    expect(open).toEqual(["2026-09-26", "2026-10-03"]);
    expect(days[1]?.reason).not.toBeNull();
  });

  it("says nothing is known, rather than 'closed', when no times are recorded", () => {
    const [first] = availabilityCalendar({ rules: [], openingSchedule: null, from: SATURDAY });
    expect(first?.available).toBe(false);
    expect(first?.reason).toBe("no_rules");
  });
});

describe("calendarVaries", () => {
  it("is false for something at the same times every day, so the calendar starts folded", () => {
    const days = availabilityCalendar({ rules: [rule({})], openingSchedule: null, from: SATURDAY });
    expect(calendarVaries(days)).toBe(false);
  });

  it("is true for something that differs by day, so the calendar starts open", () => {
    const days = availabilityCalendar({
      rules: [
        rule({
          kind: "weekly_pattern",
          daily_times: null,
          weekly_pattern: { sat: [{ start: "07:00", end: "08:00" }] },
        }),
      ],
      openingSchedule: null,
      from: SATURDAY,
    });
    expect(calendarVaries(days)).toBe(true);
  });
});
