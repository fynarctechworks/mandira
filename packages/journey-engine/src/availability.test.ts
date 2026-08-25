import { describe, expect, it } from "vitest";
import { resolveAvailability } from "./availability";
import type { AvailabilityRule, OpeningSchedule } from "./types";

const rule = (over: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
  id: "r1",
  experience_id: "e1",
  kind: "daily_fixed_times",
  daily_times: [{ start: "06:00", end: "07:30" }],
  priority: 1,
  ...over,
});

// 2026-10-12 is a Monday; 2026-10-17 a Saturday.
const MONDAY = "2026-10-12";
const SATURDAY = "2026-10-17";

describe("resolveAvailability", () => {
  it("says so plainly when nothing has been recorded", () => {
    // Distinct from "not available": one is a data gap, the other is a fact.
    expect(resolveAvailability({ rules: [], date: MONDAY })).toEqual({
      available: false,
      windows: [],
      reason: "no_rules",
    });
  });

  it("returns daily fixed windows", () => {
    const result = resolveAvailability({ rules: [rule()], date: MONDAY });
    expect(result.available).toBe(true);
    expect(result.windows).toEqual([{ start: "06:00", end: "07:30" }]);
  });

  it("answers for a specific time inside and outside the window", () => {
    expect(resolveAvailability({ rules: [rule()], date: MONDAY, time: "06:30" }).available).toBe(
      true,
    );
    expect(resolveAvailability({ rules: [rule()], date: MONDAY, time: "08:00" }).available).toBe(
      false,
    );
  });

  it("treats the window end as exclusive", () => {
    // Arriving exactly as darshan closes is not arriving in time.
    expect(resolveAvailability({ rules: [rule()], date: MONDAY, time: "07:30" }).available).toBe(
      false,
    );
    expect(resolveAvailability({ rules: [rule()], date: MONDAY, time: "07:29" }).available).toBe(
      true,
    );
  });

  it("honours a weekly pattern per weekday", () => {
    const weekly = rule({
      kind: "weekly_pattern",
      weekly_pattern: { mon: [{ start: "09:00", end: "12:00" }] },
    });

    expect(resolveAvailability({ rules: [weekly], date: MONDAY }).windows).toEqual([
      { start: "09:00", end: "12:00" },
    ]);
    expect(resolveAvailability({ rules: [weekly], date: SATURDAY }).reason).toBe(
      "not_on_this_date",
    );
  });

  it("honours a date range, inclusive of both ends", () => {
    const seasonal = rule({
      kind: "date_range",
      date_start: "2026-10-10",
      date_end: "2026-10-14",
      daily_times: [{ start: "05:00", end: "06:00" }],
    });

    expect(resolveAvailability({ rules: [seasonal], date: "2026-10-10" }).available).toBe(true);
    expect(resolveAvailability({ rules: [seasonal], date: "2026-10-14" }).available).toBe(true);
    expect(resolveAvailability({ rules: [seasonal], date: "2026-10-15" }).reason).toBe(
      "not_on_this_date",
    );
  });

  it("honours explicit calendar dates", () => {
    const festival = rule({ kind: "calendar_dates", calendar_dates: [MONDAY], daily_times: null });
    expect(resolveAvailability({ rules: [festival], date: MONDAY }).available).toBe(true);
    expect(resolveAvailability({ rules: [festival], date: SATURDAY }).reason).toBe(
      "not_on_this_date",
    );
  });

  it("reports on-request separately from unavailable", () => {
    // The UI must be able to say "arranged in advance", not "closed".
    const result = resolveAvailability({ rules: [rule({ kind: "on_request" })], date: MONDAY });
    expect(result).toEqual({ available: false, windows: [], reason: "on_request" });
  });

  it("lets the highest-priority rule win outright rather than merging windows", () => {
    // Merging would produce a union of times no single source ever claimed.
    const everyday = rule({
      id: "a",
      priority: 1,
      daily_times: [{ start: "06:00", end: "07:30" }],
    });
    const festival = rule({
      id: "b",
      priority: 5,
      kind: "calendar_dates",
      calendar_dates: [MONDAY],
      daily_times: [{ start: "04:00", end: "05:00" }],
    });

    const result = resolveAvailability({ rules: [everyday, festival], date: MONDAY });
    expect(result.windows).toEqual([{ start: "04:00", end: "05:00" }]);
  });

  it("ignores a rule outside its validity dates, whatever its priority", () => {
    const expired = rule({
      id: "b",
      priority: 9,
      valid_to: "2026-09-30",
      daily_times: [{ start: "04:00", end: "05:00" }],
    });

    const result = resolveAvailability({ rules: [rule(), expired], date: MONDAY });
    expect(result.windows).toEqual([{ start: "06:00", end: "07:30" }]);
  });

  it("follows the host place's opening hours for always_during_opening", () => {
    const schedule: OpeningSchedule = {
      weekly: {
        mon: [
          ["06:00", "12:00"],
          ["16:00", "21:00"],
        ],
      },
    };

    const result = resolveAvailability({
      rules: [rule({ kind: "always_during_opening", daily_times: null })],
      date: MONDAY,
      openingSchedule: schedule,
    });

    expect(result.windows).toEqual([
      { start: "06:00", end: "12:00" },
      { start: "16:00", end: "21:00" },
    ]);
    expect(
      resolveAvailability({
        rules: [rule({ kind: "always_during_opening", daily_times: null })],
        date: MONDAY,
        time: "14:00",
        openingSchedule: schedule,
      }).available,
    ).toBe(false);
  });

  it("respects a closure exception over the weekly pattern", () => {
    const schedule: OpeningSchedule = {
      weekly: { mon: [["06:00", "12:00"]] },
      exceptions: [{ date: MONDAY, closed: true }],
    };

    const result = resolveAvailability({
      rules: [rule({ kind: "always_during_opening", daily_times: null })],
      date: MONDAY,
      openingSchedule: schedule,
    });
    expect(result).toMatchObject({ available: false, reason: "closed" });
  });

  it("uses exceptional hours when a date overrides the pattern", () => {
    const schedule: OpeningSchedule = {
      weekly: { mon: [["06:00", "12:00"]] },
      exceptions: [{ date: MONDAY, hours: [["04:00", "23:00"]] }],
    };

    const result = resolveAvailability({
      rules: [rule({ kind: "always_during_opening", daily_times: null })],
      date: MONDAY,
      openingSchedule: schedule,
    });
    expect(result.windows).toEqual([{ start: "04:00", end: "23:00" }]);
  });

  it("drops a malformed window rather than failing the whole day", () => {
    const broken = rule({
      daily_times: [
        { start: "19:00", end: "06:00" },
        { start: "06:00", end: "07:30" },
      ],
    });
    expect(resolveAvailability({ rules: [broken], date: MONDAY }).windows).toEqual([
      { start: "06:00", end: "07:30" },
    ]);
  });

  it("returns windows in chronological order", () => {
    const split = rule({
      daily_times: [
        { start: "16:00", end: "21:00" },
        { start: "06:00", end: "12:00" },
      ],
    });
    expect(
      resolveAvailability({ rules: [split], date: MONDAY }).windows.map((w) => w.start),
    ).toEqual(["06:00", "16:00"]);
  });
});
