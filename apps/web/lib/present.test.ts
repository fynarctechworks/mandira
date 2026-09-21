import { describe, expect, it } from "vitest";
import { durationLabel, relativeTime } from "./present";

/** The catalogs' own shapes, rendered plainly enough to assert on. */
const live = (key: string, values: Record<string, string | number> = {}) => {
  if (key === "relative_now") return "now";
  if (key === "relative_in") return `in ${values["duration"]}`;
  if (key === "relative_ago") return `${values["duration"]} ago`;
  if (key === "minutes_count") return `${values["count"]} minutes`;
  return key;
};

const present = (key: string, values: Record<string, string | number> = {}) => {
  if (key === "hours") return `${values["hours"]} h`;
  if (key === "hours_minutes") return `${values["hours"]} h ${values["minutes"]} m`;
  if (key === "days_count") return `${values["count"]} days`;
  if (key === "minutes") return `${values["minutes"]} m`;
  return key;
};

const NOW = Date.parse("2026-09-21T08:00:00Z");
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("relativeTime", () => {
  it("counts the next few minutes in minutes", () => {
    expect(relativeTime(inMinutes(12), NOW, live, present)).toBe("in 12 minutes");
    expect(relativeTime(inMinutes(-25), NOW, live, present)).toBe("25 minutes ago");
  });

  it("says now for the current minute, rather than 0 minutes", () => {
    expect(relativeTime(inMinutes(0), NOW, live, present)).toBe("now");
  });

  it("counts the rest of the day, and tomorrow, in hours", () => {
    expect(relativeTime(inMinutes(90), NOW, live, present)).toBe("in 1 h 30 m");
    expect(relativeTime(inMinutes(24 * 60), NOW, live, present)).toBe("in 24 h");
  });

  it("counts anything further out in days", () => {
    // A journey three weeks away read "in 487 h 30 m" before this.
    expect(relativeTime(inMinutes(20 * 24 * 60 + 30), NOW, live, present)).toBe("in 20 days");
    expect(relativeTime(inMinutes(-3 * 24 * 60), NOW, live, present)).toBe("3 days ago");
  });
});

describe("durationLabel", () => {
  it("reads minutes below an hour and drops a zero remainder", () => {
    expect(durationLabel(45, present)).toBe("45 m");
    expect(durationLabel(120, present)).toBe("2 h");
    expect(durationLabel(90, present)).toBe("1 h 30 m");
  });

  it("has nothing to say about no duration", () => {
    expect(durationLabel(null, present)).toBeNull();
    expect(durationLabel(0, present)).toBeNull();
  });
});
