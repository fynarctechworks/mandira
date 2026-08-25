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
    // O05 is split into Routes and Transport (O05b) because they are separate screens in
    // practice; every PRD id must still be present.
    const expected = Array.from({ length: 22 }, (_, i) => `O${String(i + 1).padStart(2, "0")}`);
    for (const id of expected) {
      expect(ids, `${id} missing from the nav`).toContain(id);
    }
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

  /*
   * Two screens pointing at the same route means one of them is mislabelled — during
   * B-011 a scripted edit silently pointed the sources registry at /guidance, and the
   * accessibility entry at /routes. Neither broke a build; both were simply wrong.
   */
  it("never points two screens at the same route", () => {
    const hrefs = availableNavItems().map((item) => item.href);
    const duplicates = hrefs.filter((href, i) => hrefs.indexOf(href) !== i);
    expect(duplicates, `duplicate nav routes: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("returns the same items whether read whole or by section", () => {
    const bySection = NAV_SECTIONS.flatMap((s) => navItemsBySection(s.id));
    expect(bySection).toHaveLength(NAV_ITEMS.length);
  });

  it("has at least one reachable screen, or the shell has nowhere to land", () => {
    expect(availableNavItems().length).toBeGreaterThan(0);
  });
});
