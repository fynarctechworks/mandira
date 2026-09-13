import { describe, expect, it } from "vitest";
import { dailySeries, istDay, parseDays } from "./signals";

describe("parseDays", () => {
  it("accepts only the offered windows", () => {
    expect(parseDays("7")).toBe(7);
    expect(parseDays("90")).toBe(90);
    expect(parseDays("365")).toBe(30);
    expect(parseDays(undefined)).toBe(30);
  });
});

describe("istDay", () => {
  it("rolls over at midnight in India, not UTC", () => {
    expect(istDay(new Date("2026-09-12T18:29:00Z"))).toBe("2026-09-12");
    expect(istDay(new Date("2026-09-12T18:31:00Z"))).toBe("2026-09-13");
  });
});

describe("dailySeries", () => {
  const now = new Date("2026-09-13T06:00:00Z");
  const events = [
    { event: "journey_created", total: 10, offline: 0 },
    { event: "change_card_shown", total: 6, offline: 1 },
    { event: "report_filed", total: 1, offline: 0 },
  ];
  const daily = [
    { day: "2026-09-13", event: "journey_created", count: 4 },
    { day: "2026-09-12", event: "change_card_shown", count: 6 },
    { day: "2026-09-12", event: "report_filed", count: 1 },
    { day: "2026-08-01", event: "journey_created", count: 6 },
  ];

  it("fills every day in the window, oldest first", () => {
    const { data } = dailySeries(daily, events, 3, now, 2);
    expect(data.map((row) => row["day"])).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(data[0]).toEqual({ day: "2026-09-11", s0: 0, s1: 0, other: 0 });
  });

  it("keeps the busiest events and sums the rest", () => {
    const { series, data } = dailySeries(daily, events, 3, now, 2);
    expect(series).toEqual([
      { key: "s0", label: "journey_created" },
      { key: "s1", label: "change_card_shown" },
      { key: "other", label: "Everything else" },
    ]);
    expect(data[1]).toEqual({ day: "2026-09-12", s0: 0, s1: 6, other: 1 });
    expect(data[2]).toEqual({ day: "2026-09-13", s0: 4, s1: 0, other: 0 });
  });

  it("has no 'everything else' when every event is shown", () => {
    expect(dailySeries(daily, events, 3, now, 5).series.map((s) => s.key)).toEqual([
      "s0",
      "s1",
      "s2",
    ]);
  });

  it("drops points outside the window", () => {
    const { data } = dailySeries(daily, events, 3, now, 5);
    expect(data.reduce((sum, row) => sum + Number(row["s0"]), 0)).toBe(4);
  });
});
