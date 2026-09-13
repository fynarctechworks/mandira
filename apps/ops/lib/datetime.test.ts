import { describe, expect, it } from "vitest";
import { fromDateTimeLocal, toDateTimeLocal } from "./datetime";

describe("datetime-local round trip", () => {
  it("returns the same instant it was given", () => {
    const iso = "2026-10-02T04:30:00.000Z";
    expect(fromDateTimeLocal(toDateTimeLocal(iso))).toBe(iso);
  });

  it("formats for the input without seconds or zone", () => {
    expect(toDateTimeLocal("2026-10-02T04:30:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("treats blank and unreadable values as no value", () => {
    expect(toDateTimeLocal(null)).toBe("");
    expect(toDateTimeLocal("not a date")).toBe("");
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("nonsense")).toBeNull();
  });
});
