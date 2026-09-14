import { describe, expect, it } from "vitest";

import { distanceMeters, practicalChips } from "./practical-chips";

const temple = { latitude: 17.3855, longitude: 78.479 };

describe("practicalChips", () => {
  it("names the nearest restroom, water and cloakroom, in that order, rounded to 10 m", () => {
    const chips = practicalChips(temple, [
      { subtype: "cloakroom", latitude: 17.3857, longitude: 78.4791 },
      { subtype: "restroom", latitude: 17.3848, longitude: 78.477 },
      { subtype: "restroom", latitude: 17.3858, longitude: 78.4792 },
      { subtype: "drinking_water", latitude: 17.3862, longitude: 78.4795 },
    ]);

    expect(chips.map((chip) => chip.subtype)).toEqual(["restroom", "drinking_water", "cloakroom"]);
    expect(chips[0]!.meters % 10).toBe(0);
    // The nearer of the two restrooms, not the first one listed.
    expect(chips[0]!.meters).toBeLessThan(100);
  });

  it("leaves out a kind with nothing within a short walk", () => {
    const far = { subtype: "restroom", latitude: 17.4, longitude: 78.5 };
    expect(practicalChips(temple, [far])).toEqual([]);
  });

  it("has nothing to say without a pin for where the traveler is", () => {
    const near = { subtype: "restroom", latitude: 17.3856, longitude: 78.479 };
    expect(practicalChips(null, [near])).toEqual([]);
    expect(practicalChips({ latitude: null, longitude: null }, [near])).toEqual([]);
  });

  it("never says 0 m", () => {
    const same = { subtype: "restroom", ...temple };
    expect(practicalChips(temple, [same])[0]!.meters).toBe(10);
  });
});

describe("distanceMeters", () => {
  it("measures the fixture temple to its east gate at about 225 m", () => {
    const gate = { latitude: 17.3848, longitude: 78.477 };
    expect(Math.round(distanceMeters(temple, gate) / 10) * 10).toBeGreaterThan(200);
    expect(distanceMeters(temple, gate)).toBeLessThan(260);
  });
});
