import { expect, test } from "@playwright/test";

import {
  CPU_SLOWDOWN,
  largestContentfulPaint,
  timeInPage,
  useReferenceDevice,
} from "./reference-device";
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
  liveFromCacheMs: 500,
  searchMs: 400,
};

/** The offline spec's fixture: a three-day journey there, as PRD-OFFL-007 asks for. */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

function tomorrowInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + 86_400_000),
  );
}

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

  /*
   * Live from the offline cache: the screen a traveler opens with no signal (PRD-OFFL-002).
   *
   * Primed the way a traveler primes it — Live opened twice with a connection, so the
   * snapshot is in IndexedDB and the service worker holds the page — then the network is
   * cut and the CPU slowed to the reference device's, and the reload is timed until the
   * plan is on screen. No network throttle: there is no network.
   */
  test("Live Journey from the offline cache", async ({ page, context }) => {
    const created = await page.request.post("/api/journeys", {
      data: {
        destinationId: FIXTURE.destination,
        startDate: tomorrowInIndia(),
        dayCount: 3,
        pace: "balanced",
        mustDo: [FIXTURE.dawn],
        wouldLike: [FIXTURE.aarti],
        travelers: [{ mobility: "full", ageBand: "adult" }],
      },
    });
    expect(created.status()).toBe(200);
    const journeyId = (await created.json()).data.journeyId as string;

    const plan = page.getByRole("heading", { name: "Later today" });
    await page.goto(`/en/journeys/${journeyId}/live`);
    await expect(plan).toBeVisible();

    // The first visit installs the service worker; it controls the NEXT navigation, which is
    // also the one that caches this page. Waiting for it to be active, then reloading, is
    // what a second visit by the traveler does.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(plan).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
      timeout: 15_000,
    });
    // The snapshot is written by an effect after mount; wait until it has landed.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const request = indexedDB.open("mandhira");
                request.onsuccess = () => {
                  const database = request.result;
                  if (!database.objectStoreNames.contains("journeys")) {
                    database.close();
                    return resolve(0);
                  }
                  const count = database.transaction("journeys").objectStore("journeys").count();
                  count.onsuccess = () => {
                    database.close();
                    resolve(count.result);
                  };
                  count.onerror = () => {
                    database.close();
                    resolve(0);
                  };
                };
                request.onerror = () => resolve(0);
                request.onblocked = () => resolve(0);
              }),
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await page.reload();
    await expect(plan).toBeVisible();

    const client = await context.newCDPSession(page);
    await context.setOffline(true);
    await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
    try {
      const started = Date.now();
      await page.reload();
      await plan.waitFor();
      await page.getByText("Dawn Darshan (fixture)").first().waitFor();
      const elapsed = Date.now() - started;

      report(
        "Live from offline cache",
        elapsed,
        BUDGET.liveFromCacheMs,
        PRODUCTION.liveFromCacheMs,
      );
      expect(elapsed).toBeLessThanOrEqual(BUDGET.liveFromCacheMs);
    } finally {
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
      await context.setOffline(false);
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
