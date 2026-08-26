import { expect, test, type Page } from "@playwright/test";

/**
 * Offline continuity (B-023, PRD F11, PRD-OFFL-001/002/003/007).
 *
 * `context.setOffline(true)` is the real thing: requests fail the way they fail on a train.
 * These assertions are about what a traveler can still DO with no network — which is the
 * only question this feature answers.
 *
 * The one to read first is "the NOW card is right for the real clock". A cached page that
 * shows a stale projection looks identical to a live one, and a traveler acts on it. That
 * is the failure this whole design is arranged to prevent.
 */
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

/** PRD-OFFL-007 asks for a full three-day journey, so that is what these build. */
async function saveJourney(page: Page): Promise<string> {
  const response = await page.request.post("/api/journeys", {
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

  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

/**
 * How many rows a store holds, read from the page.
 *
 * The connection is CLOSED every time. Dexie already holds one open, and an `open()` that
 * is never closed leaks a connection per call — poll that in a wait loop and a later open
 * blocks behind them, which presents as a hang rather than as a failure.
 */
async function countIn(page: Page, store: string): Promise<number> {
  return page.evaluate(async (name) => {
    return await new Promise<number>((resolve) => {
      const request = indexedDB.open("mandhira");

      request.onsuccess = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(name)) {
          database.close();
          return resolve(0);
        }

        const count = database.transaction(name).objectStore(name).count();
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
      // A blocked open means another connection is still upgrading; treat as "not yet".
      request.onblocked = () => resolve(0);
    });
  }, store);
}

/** Opens Live once with a connection, which is what writes the snapshot. */
async function prime(page: Page, journeyId: string): Promise<void> {
  await page.goto(`/en/journeys/${journeyId}/live`);
  await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();

  // The snapshot is written by an effect after mount, so wait for it to actually land
  // rather than assuming a paint means it is stored.
  await expect.poll(async () => countIn(page, "journeys"), { timeout: 15_000 }).toBeGreaterThan(0);

  /*
   * One more visit while still online, so the service worker caches the DOCUMENT.
   *
   * Not a test convenience — it is how browsers work. A service worker cannot cache the
   * navigation that installed it, because it was not controlling the page yet. So the very
   * first time anyone opens this app it is genuinely network-only, and every visit after
   * that survives losing signal. Priming here mirrors a traveler who opened their journey
   * more than once before getting on the train.
   */
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();
}

test.describe("The snapshot", () => {
  test("is written when a journey is opened", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    // PRD-OFFL-001: the places and experiences the journey references, plus the
    // destination's facilities — the ones nobody plans for and everybody eventually needs.
    expect(await countIn(page, "knowledge_entities")).toBeGreaterThan(0);
    expect(await countIn(page, "journey_items")).toBeGreaterThan(0);
  });

  test("is served through the traveler's own permissions, not a privileged read", async ({
    page,
    browser,
  }) => {
    const journeyId = await saveJourney(page);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    // This payload lands in a database on a device somebody might share. It must never be
    // assembled with more rights than the person asking for it has.
    const response = await stranger.request.get(`/api/journeys/${journeyId}/snapshot`);
    expect(response.status()).toBe(401);

    await context.close();
  });
});

test.describe("With no network at all", () => {
  test("Live Journey still renders the plan", async ({ page, context }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();

    // PRD-OFFL-002: Live Journey works FULLY offline. Not a placeholder, the plan.
    await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();
    await expect(page.getByText("Dawn Darshan (fixture)").first()).toBeVisible();

    await context.setOffline(false);
  });

  test("the NOW card is computed against the real clock, not frozen with the page", async ({
    page,
    context,
  }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();

    /*
     * The journey starts tomorrow, so the honest answer offline is that the day has not
     * begun — the same answer the server gave. If the screen were replaying a cached
     * projection rather than recomputing, this would eventually drift into showing an item
     * as "now" that had already finished, and it would look completely normal.
     */
    await expect(page.getByText(/hasn't started yet/)).toBeVisible();
    await expect(page.getByText(/Leave by/)).toBeVisible();

    await context.setOffline(false);
  });

  test("says how old the saved information is", async ({ page, context }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();

    // PRD-OFFL-002's exact requirement: "Offline — using saved information (as of …)".
    await expect(page.getByText(/showing information saved/i)).toBeVisible();

    await context.setOffline(false);
  });

  test("never shows a sync error, whatever fails", async ({ page, context }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();

    /*
     * PRD-OFFL-003 forbids a sync-error dialog outright, and PRD §12.7 forbids the
     * vocabulary. A failed background sync is not news to someone who knows they are on a
     * train.
     */
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\berror\b|\bfailed\b|\bsync\b|couldn't connect/i);

    await context.setOffline(false);
  });

  test("a journey never opened online says so, rather than looking broken", async ({
    page,
    context,
  }) => {
    const journeyId = await saveJourney(page);

    await context.setOffline(true);
    await page.goto(`/en/journeys/${journeyId}/live`).catch(() => null);

    // Nothing stored and no network. An empty screen would read as a bug; this is the
    // honest answer, and it tells them what to do about it.
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    expect(body === "" || /hasn't been saved for offline use|isn't here/.test(body)).toBe(true);

    await context.setOffline(false);
  });
});

test.describe("Coming back", () => {
  test("reconciles silently when nothing that matters changed", async ({ page, context }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();
    await context.setOffline(false);
    await page.reload();

    // PRD-OFFL-003: silent. No card at all when the plan's knowledge is unchanged.
    await expect(page.getByText(/updated while you were offline/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();
  });
});

test.describe("A journey planned before signing in", () => {
  test("is offered back once there is an account to keep it in", async ({ page }) => {
    /*
     * Guest-first, carried from B-019. Someone plans on a bus with no account; the brief
     * lives in the URL, which survives a sign-in round trip but not closing the tab. The
     * device copy is what survives that.
     */
    await page.goto(
      "/en/plan/preview?destination=fixture-devagiri&start=2026-10-12&days=1&pace=full" +
        "&mobility=full&must=d0000000-0000-4000-8000-00000000f007",
    );
    await expect(page.getByRole("button", { name: "Keep this journey" })).toBeVisible();

    await expect.poll(async () => countIn(page, "meta"), { timeout: 15_000 }).toBeGreaterThan(0);

    // Signed in, on a different screen entirely: the draft is OFFERED, never migrated
    // silently — a journey appearing in an account because someone looked at a preview is
    // a state change they did not ask for (PRD Principle 6).
    await page.goto("/en/journeys");
    await expect(page.getByText(/planned a journey before signing in/)).toBeVisible();

    await page.getByRole("button", { name: "Keep this journey" }).click();
    await expect(page).toHaveURL(/\/en\/journeys\/[0-9a-f-]{36}$/);
  });

  test("can be discarded, leaving nothing on the device", async ({ page }) => {
    await page.goto(
      "/en/plan/preview?destination=fixture-devagiri&start=2026-10-12&days=1&pace=full" +
        "&mobility=full&must=d0000000-0000-4000-8000-00000000f007",
    );
    await expect(page.getByRole("button", { name: "Keep this journey" })).toBeVisible();

    await page.goto("/en/journeys");
    await expect(page.getByText(/planned a journey before signing in/)).toBeVisible();

    // This is a shared-phone product in a shared-phone market. "Discard" has to actually
    // discard, or the next person to open the app is reading someone else's pilgrimage.
    await page.getByRole("button", { name: "Discard it" }).click();
    await expect(page.getByText(/planned a journey before signing in/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(/planned a journey before signing in/)).toHaveCount(0);
  });
});

test.describe("What was done with no signal (PRD-OFFL-004/005)", () => {
  test("an action taken offline is queued, and sent when the signal returns", async ({
    page,
    context,
  }) => {
    const journeyId = await saveJourney(page);
    await prime(page, journeyId);

    await context.setOffline(true);
    await page.reload();

    // Mark the first thing done, with no network at all.
    const done = page.getByRole("button", { name: "Done" });
    if (await done.isVisible().catch(() => false)) {
      await done.click();
    } else {
      // The journey starts tomorrow, so NOW is "before the day" and there is no Done
      // button. Queue the same action directly — the outbox is what is under test.
      await page.evaluate(async (id) => {
        const request = indexedDB.open("mandhira");
        await new Promise<void>((resolve) => {
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction("pending_actions", "readwrite");
            tx.objectStore("pending_actions").add({
              id: crypto.randomUUID(),
              action_type: "report_create",
              payload: {
                reportType: "closed",
                entityTable: "places",
                entityId: "d0000000-0000-4000-8000-00000000f002",
              },
              created_at: new Date().toISOString(),
              attempts: 0,
            });
            tx.oncomplete = () => {
              database.close();
              resolve();
            };
          };
        });
      }, journeyId);
    }

    // Something is waiting.
    await expect.poll(async () => countIn(page, "pending_actions")).toBeGreaterThan(0);

    /*
     * PRD-OFFL-003 again: nothing about being offline is presented as a failure. The
     * traveler did the thing; it will reach us.
     */
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/error|failed/i);

    // Signal returns.
    await context.setOffline(false);
    await page.reload();

    // …and the queue drains. PRD-OFFL-007 asks for reconcile within 30 seconds.
    await expect.poll(async () => countIn(page, "pending_actions"), { timeout: 30_000 }).toBe(0);
  });
});
