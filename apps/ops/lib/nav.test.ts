import { describe, expect, it } from "vitest";
import { NAV_ITEMS, NAV_SECTIONS, availableNavItems, navItemsBySection } from "./nav";

/**
 * The nav model is the single source of truth for both the sidebar and the command
 * palette. These tests guard the properties both renderers rely on.
 */
describe("Ops nav model", () => {
  it("covers every screen in PRD §5 exactly once", () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    // O01–O22, no gaps: a missing screen would silently vanish from the platform map.
    const expected = Array.from({ length: 22 }, (_, i) => `O${String(i + 1).padStart(2, "0")}`);
    expect([...ids].sort()).toEqual(expected.sort());
  });

  it("places every item in a declared section", () => {
    const sections = new Set(NAV_SECTIONS.map((s) => s.id));
    for (const item of NAV_ITEMS) {
      expect(sections.has(item.section)).toBe(true);
    }
  });

  it("labels every unbuilt screen with the milestone that brings it", () => {
    for (const item of NAV_ITEMS) {
      if (item.href === null) {
        expect(item.comingIn, `${item.id} has no comingIn label`).toBeTruthy();
      }
    }
  });

  it("gives every available screen an absolute route", () => {
    for (const item of availableNavItems()) {
      expect(item.href.startsWith("/"), `${item.id} href must be absolute`).toBe(true);
    }
  });

  it("returns the same items whether read whole or by section", () => {
    const bySection = NAV_SECTIONS.flatMap((s) => navItemsBySection(s.id));
    expect(bySection).toHaveLength(NAV_ITEMS.length);
  });

  it("has at least one reachable screen, or the shell has nowhere to land", () => {
    expect(availableNavItems().length).toBeGreaterThan(0);
  });
});
