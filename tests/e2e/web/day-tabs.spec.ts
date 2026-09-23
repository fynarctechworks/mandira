import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * PRD §5 A10: "Journey — Days: Day tabs, timeline items, tier chips, travel legs, Health
 * pill." Every day used to be stacked in one scroll.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

async function saveJourney(page: Page, dayCount: number): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: "2026-10-12",
      dayCount,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

test.describe("Day tabs (PRD §5 A10)", () => {
  test("shows one day at a time, and says which", async ({ page }) => {
    const id = await saveJourney(page, 3);
    await page.goto(`/en/journeys/${id}`);

    const tabs = page.getByRole("tablist", { name: "Days of this journey" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: /Day 1/ })).toHaveAttribute("aria-selected", "true");

    // Exactly one panel is shown.
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
  });

  test("keeps the chosen day in the URL, so a link can land on it", async ({ page }) => {
    const id = await saveJourney(page, 3);
    await page.goto(`/en/journeys/${id}`);

    await page.getByRole("tab", { name: /Day 3/ }).click();
    await expect(page).toHaveURL(new RegExp(`#day-2$`));

    await page.goto(`/en/journeys/${id}#day-1`);
    await expect(page.getByRole("tab", { name: /Day 2/ })).toHaveAttribute("aria-selected", "true");
  });

  test("moves between days with the arrow keys, as tabs do", async ({ page }) => {
    const id = await saveJourney(page, 3);
    await page.goto(`/en/journeys/${id}`);

    await page.getByRole("tab", { name: /Day 1/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /Day 2/ })).toBeFocused();
    await expect(page.getByRole("tab", { name: /Day 2/ })).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: /Day 3/ })).toBeFocused();

    // Wraps rather than stopping: ArrowRight from the last day comes back to the first.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /Day 1/ })).toBeFocused();
  });

  test("a one-day journey has no tabs — a single tab is a control that does nothing", async ({
    page,
  }) => {
    const id = await saveJourney(page, 1);
    await page.goto(`/en/journeys/${id}`);

    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });

  test("the tabbed journey page is accessible", async ({ page }) => {
    const id = await saveJourney(page, 3);
    await page.goto(`/en/journeys/${id}`);
    await page.getByRole("tablist").waitFor();

    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});
