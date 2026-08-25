import { describe, expect, it } from "vitest";
import { BASE_BUFFER_MINUTES, computeBuffer } from "./buffer";
import type { TravelerProfile } from "./types";

const traveler = (over: Partial<TravelerProfile> = {}): TravelerProfile => ({
  id: "t1",
  mobility: "full",
  age_band: "adult",
  ...over,
});

describe("computeBuffer (PRD-PLAN-005)", () => {
  it("uses 15 minutes for a group with no additional needs", () => {
    expect(computeBuffer({ travelers: [traveler()] })).toBe(BASE_BUFFER_MINUTES);
    expect(BASE_BUFFER_MINUTES).toBe(15);
  });

  it("uses the base even with no travelers recorded", () => {
    expect(computeBuffer({ travelers: [] })).toBe(15);
  });

  it("applies x1.5 for a senior", () => {
    expect(computeBuffer({ travelers: [traveler({ age_band: "senior" })] })).toBe(23);
  });

  it("applies x1.5 for limited walking", () => {
    expect(computeBuffer({ travelers: [traveler({ mobility: "limited_walking" })] })).toBe(23);
  });

  it("applies x2 for a wheelchair user", () => {
    expect(computeBuffer({ travelers: [traveler({ mobility: "wheelchair" })] })).toBe(30);
  });

  it("applies x2 for someone needing frequent rest", () => {
    expect(computeBuffer({ travelers: [traveler({ mobility: "needs_rest_frequently" })] })).toBe(
      30,
    );
  });

  it("takes the largest multiplier in the group, not an average", () => {
    // A group moves at the pace of whoever needs the most time; averaging would produce a
    // buffer that suits nobody in it.
    const group = [
      traveler({ id: "a" }),
      traveler({ id: "b", age_band: "senior" }),
      traveler({ id: "c", mobility: "wheelchair" }),
    ];
    expect(computeBuffer({ travelers: group })).toBe(30);
  });

  it("rounds up rather than shaving time from whoever needed it", () => {
    // 15 x 1.5 = 22.5 → 23, matching PRD Appendix A's "22.5 min" rounded to a real minute.
    expect(computeBuffer({ travelers: [traveler({ age_band: "senior" })] })).toBe(23);
    expect(computeBuffer({ baseMinutes: 5, travelers: [traveler({ age_band: "senior" })] })).toBe(
      8,
    );
  });

  it("honours an overridden base, since buffers are editable", () => {
    expect(computeBuffer({ baseMinutes: 30, travelers: [traveler()] })).toBe(30);
    expect(
      computeBuffer({ baseMinutes: 0, travelers: [traveler({ mobility: "wheelchair" })] }),
    ).toBe(0);
  });
});
