import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The health detail sheet and "Simplify this day" (PRD F5 A12, PRD F4).
 *
 * The property that matters most: asking to simplify changes nothing. The plan moves only
 * when an option on the Change Card is tapped (PRD Principle 6).
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

/** A day squeezed into one hour, so it cannot be comfortable and there is something to explain. */
async function saveSqueezedJourney(page: Page): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: "2026-10-12",
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });
  expect(response.status()).toBe(200);
  const journeyId = (await response.json()).data.journeyId as string;

  const squeezed = await page.request.patch(`/api/journeys/${journeyId}`, {
    data: { dayStartTime: "17:00", dayEndTime: "18:00" },
  });
  expect(squeezed.status()).toBe(200);

  return journeyId;
}

async function timeline(page: Page): Promise<string[]> {
  return page.getByRole("heading", { level: 3 }).allTextContents();
}

test.describe("The health detail sheet", () => {
  test("explains the day in words, by check, with no score", async ({ page }) => {
    const journeyId = await saveSqueezedJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    await page
      .getByRole("button", { name: /^See why/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: /holds together/ });
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole("heading", { name: "Time", exact: true })).toBeVisible();
    // PRD F5: never a numeric score.
    await expect(sheet).not.toContainText("%");

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(seriousViolations(results)).toEqual([]);
  });

  test("Simplify this day offers options and changes nothing until one is chosen", async ({
    page,
  }) => {
    const journeyId = await saveSqueezedJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);
    const before = await timeline(page);

    await page
      .getByRole("button", { name: /^See why/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: /holds together/ });
    await sheet.getByRole("button", { name: "Simplify this day" }).click();

    const card = page.getByRole("dialog", { name: "Something changed" });
    const answer = sheet.getByRole("status").filter({ hasText: /fits|gentler/ });
    await expect(card.or(answer)).toBeVisible();

    // Nothing was applied by asking.
    const fresh = await page.context().newPage();
    await fresh.goto(`/en/journeys/${journeyId}`);
    expect(await timeline(fresh)).toEqual(before);
    await fresh.close();

    if (await card.isVisible()) {
      await expect(card.getByText("Recommended")).toBeVisible();
      await card.getByRole("button", { name: "Keep my plan as is" }).click();
      await expect(card).toBeHidden();

      await page.reload();
      expect(await timeline(page)).toEqual(before);
    }
  });
});
