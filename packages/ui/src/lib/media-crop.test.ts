import { describe, expect, it } from "vitest";

import {
  MEDIA_CROP_PRESETS,
  clampFocal,
  focalObjectPosition,
  focalPointOf,
  nudgeFocal,
} from "./media-crop";

describe("media crop presets", () => {
  it("ships exactly the two ratios PRD §12 names", () => {
    expect(Object.keys(MEDIA_CROP_PRESETS)).toEqual(["hero", "card"]);
    expect(MEDIA_CROP_PRESETS.hero.aspectRatio).toBe("3 / 2");
    expect(MEDIA_CROP_PRESETS.card.aspectRatio).toBe("4 / 3");
  });
});

describe("clampFocal", () => {
  it("keeps a point inside the image, at the column's precision", () => {
    expect(clampFocal(-0.2)).toBe(0);
    expect(clampFocal(1.4)).toBe(1);
    expect(clampFocal(0.12345)).toBe(0.123);
  });

  it("frames from the centre when there is nothing usable", () => {
    expect(clampFocal(null)).toBe(0.5);
    expect(clampFocal(undefined)).toBe(0.5);
    expect(clampFocal(Number.NaN)).toBe(0.5);
  });
});

describe("focalPointOf", () => {
  it("reads the asset's columns", () => {
    expect(focalPointOf({ focal_x: 0.25, focal_y: 0.8 })).toEqual({ x: 0.25, y: 0.8 });
  });

  it("treats a row read without the columns as centred", () => {
    expect(focalPointOf({})).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("focalObjectPosition", () => {
  it("renders percentages CSS object-position understands", () => {
    expect(focalObjectPosition({ x: 0.25, y: 0.8 })).toBe("25% 80%");
    expect(focalObjectPosition({ x: 0.5, y: 0.5 })).toBe("50% 50%");
    expect(focalObjectPosition({ x: 0.333, y: 1 })).toBe("33.3% 100%");
  });
});

describe("nudgeFocal", () => {
  it("moves along one axis and leaves the other alone", () => {
    expect(nudgeFocal({ x: 0.5, y: 0.5 }, "x", 0.01)).toEqual({ x: 0.51, y: 0.5 });
    expect(nudgeFocal({ x: 0.5, y: 0.5 }, "y", -0.1)).toEqual({ x: 0.5, y: 0.4 });
  });

  it("stops at the edge rather than leaving the image", () => {
    expect(nudgeFocal({ x: 0.995, y: 0 }, "x", 0.1)).toEqual({ x: 1, y: 0 });
    expect(nudgeFocal({ x: 0, y: 0.02 }, "y", -0.1)).toEqual({ x: 0, y: 0 });
  });
});
