import { expect, test } from "@playwright/test";

import { largestContentfulPaint, timeInPage, useReferenceDevice } from "./reference-device";
import { report } from "./report";

/**
 * TRD §9's Milestone 1 targets, measured (TRD-PERF-001, PRD-PLAN-009).
 *
 * Run with `pnpm perf`, not in the ordinary suite. Every number here is a wall-clock
 * measurement, and measuring wall-clock time next to forty other tests fighting for the
 * same four cores produces a number about the laptop rather than about the product.
 *
 * Each test prints what it measured whether it passes or fails, because "LCP 2.1 s against
 * a 3.0 s budget" is the useful output and a green tick is not. The printed lines are the
 * artefact this requirement was asking for.
 */

/** TRD §9, Milestone 1 column — asserted. */
const BUDGET = {
  homeLcpMs: 3000,
  repeatTtiMs: 1500,
  routeTransitionMs: 300,
  liveFromCacheMs: 800,
  searchMs: 600,
};

/** TRD §9, production column (TRD-PERF-002) — reported beside it. */
const PRODUCTION = {
  homeLcpMs: 2000,
  repeatTtiMs: 1000,
  routeTransitionMs: 200,
  searchMs: 400,
};

test.describe("TRD §9 Milestone 1 budgets, on the reference device", () => {
  test("first load of Home, cold, over 4G", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      await page.goto("/en", { waitUntil: "load" });
      const lcp = await largestContentfulPaint(page);

      expect(lcp, "the browser reported no LCP at all").not.toBeNull();
      report("Home LCP (cold, 4G)", lcp!, BUDGET.homeLcpMs, PRODUCTION.homeLcpMs);
      expect(lcp!).toBeLessThanOrEqual(BUDGET.homeLcpMs);
    } finally {
      await restore();
    }
  });

  test("repeat load, with the shell already precached", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      // First visit warms the service worker and the HTTP cache; the second is the one
      // TRD §9 means by "repeat load".
      await page.goto("/en", { waitUntil: "load" });
      await page.waitForTimeout(500);

      const started = Date.now();
      await page.goto("/en", { waitUntil: "load" });
      await page.locator("main").first().waitFor();
      const tti = Date.now() - started;

      report("Home repeat load", tti, BUDGET.repeatTtiMs, PRODUCTION.repeatTtiMs);
      expect(tti).toBeLessThanOrEqual(BUDGET.repeatTtiMs);
    } finally {
      await restore();
    }
  });

  test("a client navigation between two traveler screens", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      await page.goto("/en", { waitUntil: "load" });

      /*
       * Home → Journeys through the bottom navigation: the transition a traveler makes
       * most, and one of the four the nav actually offers.
       *
       * Found by href rather than by label. A label match would break when the copy
       * changes, turning a performance budget into a copy test — and it did: the first
       * version of this looked for a "Search" link, which the bottom navigation has never
       * had.
       */
      const link = page.locator('a[href$="/journeys"]').first();
      await link.waitFor({ state: "visible" });

      const elapsed = await timeInPage(page, async () => {
        await link.click();
        await page.waitForURL(/\/en\/journeys/);
      });

      report(
        "Route transition (client nav)",
        elapsed,
        BUDGET.routeTransitionMs,
        PRODUCTION.routeTransitionMs,
      );
      expect(elapsed).toBeLessThanOrEqual(BUDGET.routeTransitionMs);
    } finally {
      await restore();
    }
  });

  test("search answers within its budget", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      await page.goto("/en/search", { waitUntil: "load" });

      const started = Date.now();
      const response = await page.request.get("/api/search?q=temple&locale=en");
      const elapsed = Date.now() - started;

      expect(response.ok(), `search answered ${response.status()}`).toBe(true);
      report("Search response", elapsed, BUDGET.searchMs, PRODUCTION.searchMs);
      expect(elapsed).toBeLessThanOrEqual(BUDGET.searchMs);
    } finally {
      await restore();
    }
  });
});
