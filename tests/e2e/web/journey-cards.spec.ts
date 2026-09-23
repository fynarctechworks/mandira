import { expect, test, type Page } from "@playwright/test";

/**
 * Journey cards say which pilgrimage, when, and how it stands — on the Journeys list AND
 * the Prepare hub (design review: "every card reads 'Your journey · date' — no
 * destination, range or health"). The Prepare hub had been missed by the first fix.
 *
 * Health on a card is the engine's STORED verdict. Nothing wrote that column until D-230,
 * so these also prove it is now kept: the journey is opened once (which runs the engine),
 * and the lists then show what it found.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

async function upcomingJourney(page: Page): Promise<string> {
  const start = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: start,
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });
  expect(response.status()).toBe(200);
  const id = (await response.json()).data.journeyId as string;
  // Opening it runs the engine, which now stores its verdict on the journey.
  await page.goto(`/en/journeys/${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return id;
}

test.describe("Journey cards name the pilgrimage and say how it stands", () => {
  test("on the Journeys list", async ({ page }) => {
    const id = await upcomingJourney(page);
    await page.goto("/en/journeys");

    const card = page.locator(`a[href="/en/journeys/${id}"]`);
    await expect(card).toContainText("Devagiri");
    // A health pill, in words (PRD §12.8: never colour alone).
    await expect(card.getByText(/Comfortable|Tight|At risk|Broken/)).toBeVisible();
  });

  test("and on the Prepare hub, which the first fix missed", async ({ page }) => {
    const id = await upcomingJourney(page);
    await page.goto("/en/prepare");

    const card = page.locator(`a[href="/en/journeys/${id}/prepare"]`);
    await expect(card).toContainText("Devagiri");
    await expect(card.getByText(/Comfortable|Tight|At risk|Broken/)).toBeVisible();
  });
});
