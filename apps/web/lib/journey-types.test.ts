import { describe, expect, it } from "vitest";

import { dayCountOf } from "./journey-types";

describe("dayCountOf", () => {
  it("counts the days the dates span, inclusive", () => {
    expect(dayCountOf({ startDate: "2026-10-12", endDate: "2026-10-14" }, [])).toBe(3);
  });

  it("falls back to how far the items reach when the journey has no end date", () => {
    expect(
      dayCountOf({ startDate: "2026-10-12", endDate: null }, [{ day_index: 0 }, { day_index: 3 }]),
    ).toBe(4);
  });

  it("is at least one day", () => {
    expect(dayCountOf({ startDate: null, endDate: null }, [])).toBe(1);
  });
});
