import { describe, expect, it } from "vitest";
import { barValue, periodLabel } from "./quotas";

describe("free quotas", () => {
  it("names the period, in UTC", () => {
    expect(periodLabel("day")).toBe("Today (UTC)");
    expect(periodLabel("month")).toBe("This month (UTC)");
  });

  it("keeps the bar between empty and full", () => {
    expect(barValue(45)).toBe(45);
    expect(barValue(130)).toBe(100);
    expect(barValue(-5)).toBe(0);
  });
});
