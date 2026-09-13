import { expect, test, type Page } from "@playwright/test";

/**
 * Reordering a day (TRD `POST /api/journeys/:id/reorder`, PRD F4).
 *
 * Move up and move down, each an explicit tap. The order must name every item of the day
 * exactly once, and the route is what holds that — not the buttons.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

const NAMES = ["Dawn Darshan (fixture)", "Evening Aarti (fixture)"];

async function saveOneDayJourney(page: Page): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: "2026-10-12",
      dayCount: 1,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

/** The day's item names, in the order the timeline shows them. */
async function order(page: Page): Promise<string[]> {
  const headings = await page.getByRole("heading", { level: 3 }).allTextContents();
  return headings.filter((text) => NAMES.includes(text));
}

async function itemId(page: Page, name: string): Promise<string> {
  const id = await page
    .locator("li")
    .filter({ hasText: name })
    .locator("select[id^='tier-']")
    .first()
    .getAttribute("id");
  return id?.replace("tier-", "") ?? "";
}

test.describe("Reordering", () => {
  test("moves an item later with one tap, and the new order holds on reload", async ({ page }) => {
    const journeyId = await saveOneDayJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    const before = await order(page);
    expect(before).toHaveLength(2);
    const [first, second] = before as [string, string];

    await expect(page.getByRole("button", { name: `Move ${first} earlier` })).toBeDisabled();
    await page.getByRole("button", { name: `Move ${first} later` }).click();

    await expect.poll(() => order(page)).toEqual([second, first]);

    await page.reload();
    expect(await order(page)).toEqual([second, first]);
  });

  test("refuses an order that leaves something out", async ({ page }) => {
    const journeyId = await saveOneDayJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    const dawn = await itemId(page, NAMES[0]!);
    expect(dawn).not.toBe("");

    const response = await page.request.post(`/api/journeys/${journeyId}/reorder`, {
      data: { dayIndex: 0, orderedItemIds: [dawn] },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error.message).toMatch(/everything on that day/);
  });

  test.describe("as a guest", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("is refused", async ({ page }) => {
      const response = await page.request.post(
        "/api/journeys/00000000-0000-4000-8000-000000000000/reorder",
        { data: { dayIndex: 0, orderedItemIds: ["00000000-0000-4000-8000-000000000001"] } },
      );
      expect(response.status()).toBe(401);
    });
  });
});
