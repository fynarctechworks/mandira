import type { AvailabilityRule } from "@mandhira/journey-engine";
import { describe, expect, it } from "vitest";

import { nextOccurrence, todayIn } from "./next-occurrence";

const rule = (over: Partial<AvailabilityRule>): AvailabilityRule => ({
  id: "r1",
  experience_id: "e1",
  kind: "daily_fixed_times",
  daily_times: [{ start: "06:00", end: "07:00" }],
  priority: 1,
  ...over,
});

describe("nextOccurrence", () => {
  it("is today for something that happens every day", () => {
    expect(nextOccurrence([rule({})], "2026-09-14")).toEqual({
      date: "2026-09-14",
      start: "06:00",
    });
  });

  it("finds the next published date of a festival", () => {
    const festival = rule({ kind: "calendar_dates", calendar_dates: ["2026-10-12", "2027-10-01"] });
    expect(nextOccurrence([festival], "2026-09-14")?.date).toBe("2026-10-12");
    expect(nextOccurrence([festival], "2026-10-13")?.date).toBe("2027-10-01");
  });

  it("says nothing rather than guessing when no date is published ahead", () => {
    const past = rule({ kind: "calendar_dates", calendar_dates: ["2025-10-12"] });
    expect(nextOccurrence([past], "2026-09-14")).toBeNull();
    expect(nextOccurrence([], "2026-09-14")).toBeNull();
  });

  it("does not offer something only available on request", () => {
    expect(
      nextOccurrence([rule({ kind: "on_request", daily_times: null })], "2026-09-14"),
    ).toBeNull();
  });
});

describe("todayIn", () => {
  it("is the date in the destination's timezone, not the server's", () => {
    // 20:00 UTC on the 13th is already the 14th in India.
    expect(todayIn("Asia/Kolkata", new Date("2026-09-13T20:00:00Z"))).toBe("2026-09-14");
  });
});
