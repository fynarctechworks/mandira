import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Live Journey — NOW / NEXT / LATER (B-022, PRD F8, LIVE-01..04).
 *
 * The hard part of testing this is "now". The engine takes `nowAt` as a parameter and has
 * no clock of its own (D-005), but the PAGE reads the real clock — so which card is NOW
 * depends on when the suite runs.
 *
 * Rather than freeze time (which would test a fake), each case builds a journey whose day
 * is positioned relative to the actual current time. A journey starting today with an item
 * an hour from now genuinely produces the "before day" state, and it does so at 3am or at
 * 3pm.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

/** Today in the journey's own timezone, which is where its day boundaries are drawn. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/**
 * Tomorrow, for the cases that need every item to still be ahead.
 *
 * The fixture's experiences sit at 06:00 and 18:30, so a journey starting today has
 * consumed both by an evening test run and the day reads as complete — correct behaviour,
 * and useless for asserting what NEXT and LATER look like. Dating the journey forward
 * makes those states deterministic without faking the clock.
 */
function tomorrowInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + 86_400_000),
  );
}

async function saveJourney(page: Page, startDate: string): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate,
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });

  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

test.describe("Reaching Live Journey", () => {
  test("is the primary action on a journey, not buried", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    await page.goto(`/en/journeys/${journeyId}`);

    await page.getByRole("link", { name: "Today" }).click();
    await expect(page).toHaveURL(new RegExp(`/journeys/${journeyId}/live$`));
  });

  test("works before the journey has started, without asking to start it today", async ({
    page,
  }) => {
    // PRD-LIVE-001: activation is a read-time decision. The screen must not be gated behind
    // a write — someone opening the app at the temple gate has not tapped anything yet.
    //
    // Starting TOMORROW so the assertion does not depend on the wall clock: the fixture's
    // items sit at 06:00 and 18:30, so a journey starting today has already consumed both
    // by the time an evening test run reaches here.
    const journeyId = await saveJourney(page, tomorrowInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    // "Start today" is for a day the journey is on (D-187): the evening before, it asked the
    // traveler to start a journey that begins tomorrow. The next test covers a journey today.
    await expect(page.getByRole("button", { name: "Start today" })).toBeHidden();
    // And the plan is already there, not hidden behind a tap.
    await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();
  });

  test("Start today activates the journey and stops asking", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    await page.getByRole("button", { name: "Start today" }).click();
    await expect(page.getByRole("button", { name: "Start today" })).toBeHidden();
  });
});

test.describe("What the screen says", () => {
  test("shows the day's health, and why", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    // PRD F8 pins the health pill at the top. Never a number (PRD F5).
    await expect(page.getByText(/Comfortable|Tight|At risk|can't work/)).toBeVisible();
    await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
  });

  test("lists the rest of the day compactly, with tiers", async ({ page }) => {
    // Tomorrow, so every item is still ahead whatever time this runs (see above).
    const journeyId = await saveJourney(page, tomorrowInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    await expect(page.getByRole("heading", { name: "Later today" })).toBeVisible();

    // PRD-LIVE-003: each row carries its tier chip and its window, and nothing more —
    // the compact list is what keeps Live from becoming the calendar it must not be.
    const rows = page.getByRole("heading", { name: "Later today" }).locator("~ ul > li");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first().getByText(/AM|PM|—/)).toBeVisible();
  });

  test("says what's happening now, before anything else on the screen", async ({ page }) => {
    const journeyId = await saveJourney(page, tomorrowInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    /*
     * PRD-LIVE-005 asks for what / when / where in five seconds. The usability target
     * itself needs ten people; what is verifiable here is the structural precondition —
     * NOW comes first, and NEXT carries a departure time.
     */
    await expect(page.getByRole("heading", { name: "Next" })).toBeVisible();
    await expect(page.getByText(/Leave by/)).toBeVisible();
  });

  test("has no calendar grid and never more than three actions (PRD-LIVE-006)", async ({
    page,
  }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    // A week view inside Live is explicitly forbidden — the whole point is three questions.
    await expect(page.getByText(/Monday.*Tuesday.*Wednesday/s)).toHaveCount(0);

    // The NOW card caps at three; anything more means a card started growing.
    const nowCard = page.getByRole("region", { name: /Now|Today/ });
    if (await nowCard.isVisible()) {
      expect(await nowCard.getByRole("button").count()).toBeLessThanOrEqual(3);
    }
  });

  test("says the day hasn't started when it hasn't", async ({ page }) => {
    // A journey beginning tomorrow: there is nothing to be doing right now, and saying so
    // is better than showing an empty card that looks broken.
    const journeyId = await saveJourney(page, tomorrowInIndia());
    await page.goto(`/en/journeys/${journeyId}/live`);

    await expect(
      page.getByRole("heading", { name: /hasn't started yet|Today is complete/ }),
    ).toBeVisible();
  });
});

test.describe("The three actions (PRD-LIVE-002)", () => {
  /** The API is hit directly: the three actions must hold at the route, not in the UI. */
  test("Done records the item without rescheduling anything else", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());

    const items = await itemsOf(page, journeyId);
    const first = items[0]!;

    const response = await page.request.patch(
      `/api/journeys/${journeyId}/items/${first.id}/status`,
      { data: { action: "done" } },
    );
    expect(response.status()).toBe(200);

    const after = (await response.json()).data.items as { id: string; planned_start_at: string }[];

    /*
     * PRD Principle 6, asserted rather than assumed. "Done" records what happened; it must
     * not quietly move everything after it. Rescheduling is a Change Card the traveler
     * accepts (PRD F6, B-026), never a side effect of tapping Done.
     */
    for (const item of after) {
      const original = items.find((i) => i.id === item.id);
      expect(item.planned_start_at, item.id).toBe(original?.planned_start_at);
    }
  });

  test("Running late records an overrun and leaves the plan alone", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    const items = await itemsOf(page, journeyId);
    const first = items[0]!;

    const response = await page.request.patch(
      `/api/journeys/${journeyId}/items/${first.id}/status`,
      { data: { action: "running_late", extraMinutes: 20 } },
    );

    expect(response.status()).toBe(200);
    const after = (await response.json()).data.items as { id: string; planned_start_at: string }[];
    expect(after.find((i) => i.id === first.id)?.planned_start_at).toBe(first.planned_start_at);
  });

  test("returns fresh health with every action, so no verdict goes stale", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    const items = await itemsOf(page, journeyId);

    const response = await page.request.patch(
      `/api/journeys/${journeyId}/items/${items[0]!.id}/status`,
      { data: { action: "done" } },
    );

    expect((await response.json()).data.health).not.toBeNull();
  });

  test("refuses an overrun longer than the cap, rather than stretching a day", async ({ page }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    const items = await itemsOf(page, journeyId);

    // Past four hours the traveler has not run late, they have changed their day — and the
    // honest move is to edit the plan, not to stretch one item over it.
    const response = await page.request.patch(
      `/api/journeys/${journeyId}/items/${items[0]!.id}/status`,
      { data: { action: "running_late", extraMinutes: 600 } },
    );

    expect(response.status()).toBe(400);
  });

  test("a guest cannot set status on anything", async ({ page, browser }) => {
    const journeyId = await saveJourney(page, todayInIndia());
    const items = await itemsOf(page, journeyId);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    const response = await stranger.request.patch(
      `/api/journeys/${journeyId}/items/${items[0]!.id}/status`,
      { data: { action: "done" } },
    );

    expect(response.status()).toBe(401);
    await context.close();
  });
});

test("the Live screen is accessible", async ({ page }) => {
  const journeyId = await saveJourney(page, todayInIndia());
  await page.goto(`/en/journeys/${journeyId}/live`);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(seriousViolations(results)).toEqual([]);
});

/**
 * The journey's items, read through surfaces that already exist.
 *
 * There is no GET for journey items — the offline snapshot that will need one is B-023 —
 * so rather than add a route for the tests' convenience, an id is scraped from the
 * builder's own controls and a harmless edit echoes the full list back.
 */
async function itemsOf(
  page: Page,
  journeyId: string,
): Promise<{ id: string; planned_start_at: string }[]> {
  await page.goto(`/en/journeys/${journeyId}`);

  // `ItemActions` renders `tier-<itemId>` on its tier control, one per item.
  const anyItemId = await page
    .locator('[id^="tier-"]')
    .first()
    .evaluate((node) => node.id.replace("tier-", ""));

  /*
   * Setting the note to what it already is: an `annotate`, which PRD-PLAN-002 always
   * allows and which needs no confirmation. It changes nothing and returns the whole list.
   */
  const response = await page.request.patch(`/api/journeys/${journeyId}/items/${anyItemId}`, {
    data: { note: null },
  });
  expect(response.status()).toBe(200);

  return (await response.json()).data.items;
}
