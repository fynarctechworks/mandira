import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Add to journey (PRD-DISC-004, TRD `POST /api/journeys/:id/items`).
 *
 * The one path from discovery into a plan. The rules that matter — published for THIS
 * destination, a fixed item needs its time, nothing twice — are asserted against the route
 * as well as through the sheet, because hiding a control has never been a control.
 */
const FIXTURE = {
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

const DAWN_PAGE = "/en/destinations/fixture-devagiri/experiences/fixture-dawn-darshan";

/** A journey without Dawn Darshan in it, named so the sheet can pick it out from the rest. */
async function saveJourney(page: Page): Promise<{ id: string; title: string }> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: "2026-10-12",
      dayCount: 2,
      pace: "balanced",
      mustDo: [],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });
  expect(response.status()).toBe(200);
  const id = (await response.json()).data.journeyId as string;

  const title = `Add to journey ${Date.now()}`;
  const renamed = await page.request.patch(`/api/journeys/${id}`, { data: { title } });
  expect(renamed.status()).toBe(200);

  return { id, title };
}

test.describe("A guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is sent to sign in, with the way back to the experience", async ({ page }) => {
    await page.goto(DAWN_PAGE);

    await expect(
      page.getByRole("link", { name: "Sign in to add this to a journey" }),
    ).toHaveAttribute("href", `/en/sign-in?next=${encodeURIComponent(DAWN_PAGE)}`);
  });

  test("cannot add through the route either", async ({ page }) => {
    const response = await page.request.post(
      "/api/journeys/00000000-0000-4000-8000-000000000000/items",
      { data: { experienceId: FIXTURE.aarti } },
    );
    expect(response.status()).toBe(401);
  });
});

test.describe("Adding from an experience", () => {
  test("puts it on the chosen journey, day and tier", async ({ page }) => {
    const journey = await saveJourney(page);

    await page.goto(DAWN_PAGE);
    await page.getByRole("button", { name: "Add to journey" }).click();

    const sheet = page.getByRole("dialog", { name: "Add to a journey" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: journey.title }).click();
    await sheet.getByLabel("Which day").selectOption({ index: 1 });
    await sheet.getByRole("radio", { name: /^Optional/ }).click();

    await expect(page.getByRole("button", { name: "Add to this journey" })).toBeEnabled();
    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(seriousViolations(results)).toEqual([]);

    await sheet.getByRole("button", { name: "Add to this journey" }).click();
    await expect(sheet.getByText("Added to your journey.")).toBeVisible();

    await sheet.getByRole("link", { name: "Open the journey" }).click();
    // Lands on the day it was added to (day index 1), not on the first day with the new
    // stop hidden behind a tab (PRD §5 A10).
    await expect(page).toHaveURL(new RegExp(`/journeys/${journey.id}#day-1$`));
    await expect(page.getByRole("tab", { name: /Day 2/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Dawn Darshan (fixture)" })).toBeVisible();

    // Persisted, not just shown: the route now refuses the same experience again.
    const again = await page.request.post(`/api/journeys/${journey.id}/items`, {
      data: { experienceId: "d0000000-0000-4000-8000-00000000f007", dayIndex: 0 },
    });
    expect(again.status()).toBe(409);
  });

  test("asks for the time of a fixed item before it can be added", async ({ page }) => {
    const journey = await saveJourney(page);

    await page.goto(DAWN_PAGE);
    await page.getByRole("button", { name: "Add to journey" }).click();
    const sheet = page.getByRole("dialog", { name: "Add to a journey" });
    await sheet.getByRole("radio", { name: journey.title }).click();
    await sheet.getByRole("radio", { name: /^Fixed/ }).click();

    await expect(sheet.getByRole("button", { name: "Add to this journey" })).toBeDisabled();

    const response = await page.request.post(`/api/journeys/${journey.id}/items`, {
      data: { experienceId: "d0000000-0000-4000-8000-00000000f007", tier: "fixed" },
    });
    expect(response.status()).toBe(400);
  });

  test("refuses an experience that isn't published for the journey's destination", async ({
    page,
  }) => {
    const journey = await saveJourney(page);

    const response = await page.request.post(`/api/journeys/${journey.id}/items`, {
      data: { experienceId: "d0000000-0000-4000-8000-00000000f005", dayIndex: 0 },
    });

    expect(response.status()).toBe(404);
    expect((await response.json()).error.message).not.toMatch(/\berror\b|\bfailed\b/i);
  });
});
