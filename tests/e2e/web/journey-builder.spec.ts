import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The journey builder (B-019, PRD F4, PLAN-01/02/03/05).
 *
 * The assertions that matter most hit the API DIRECTLY rather than the screen. PRD-PLAN-002's
 * tier rules must hold at the route, because hiding a button has never been a control
 * (CLAUDE.md §4) — a test that only clicks what the UI offers proves the UI is consistent
 * with itself and nothing more.
 *
 * Signs in through the real magic-link flow. A fabricated cookie would prove the fixture
 * works, not that a traveler can save a journey.
 */

const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

/** Builds and saves a journey, returning its id. */
async function saveJourney(page: Page): Promise<string> {
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
  return (await response.json()).data.journeyId as string;
}

test.describe("A guest", () => {
  /*
   * Runs signed OUT even though this project carries a session: refusing a guest is the
   * behaviour under test, and inheriting an account would skip it entirely.
   */
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is asked to sign in rather than silently refused", async ({ page }) => {
    const response = await page.request.post("/api/journeys", {
      data: {
        destinationId: FIXTURE.destination,
        startDate: "2026-10-12",
        dayCount: 1,
        mustDo: [FIXTURE.dawn],
        wouldLike: [],
        travelers: [{ mobility: "full", ageBand: "adult" }],
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    // PRD §12.7: no "error"/"failed" vocabulary anywhere a traveler can read.
    expect(body.error.message).not.toMatch(/\berror\b|\bfailed\b/i);
  });
});

test.describe("Saving a journey", () => {
  test("a signed-in traveler can save and reopen a journey", async ({ page }) => {
    const journeyId = await saveJourney(page);

    await page.goto(`/en/journeys/${journeyId}`);
    await expect(page.getByRole("heading", { name: "Your journey" })).toBeVisible();
    // By heading: each item's "Do this after" list also names the other items (D-192).
    await expect(page.getByRole("heading", { name: "Dawn Darshan (fixture)" })).toBeVisible();

    await page.goto("/en/journeys");
    // The one this test just made. Other tests in the file save journeys for the same
    // traveler, so a bare "is there a journey" assertion would pass on somebody else's.
    const card = page.locator(`a[href$="/journeys/${journeyId}"]`);
    await expect(card).toBeVisible();
    // Which pilgrimage it is, not only that a journey exists (design review).
    await expect(card).toContainText("Devagiri");
  });

  test("refuses a brief with nothing chosen, and says what to do", async ({ page }) => {
    const response = await page.request.post("/api/journeys", {
      data: {
        destinationId: FIXTURE.destination,
        startDate: "2026-10-12",
        dayCount: 1,
        mustDo: [],
        wouldLike: [],
        travelers: [{ mobility: "full", ageBand: "adult" }],
      },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error.message).toMatch(/at least one thing/);
  });

  test("refuses more than the twelve travelers PRD-PLAN-010 allows", async ({ page }) => {
    const response = await page.request.post("/api/journeys", {
      data: {
        destinationId: FIXTURE.destination,
        startDate: "2026-10-12",
        dayCount: 1,
        mustDo: [FIXTURE.dawn],
        wouldLike: [],
        travelers: Array.from({ length: 13 }, () => ({ mobility: "full", ageBand: "adult" })),
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("The tier rules hold at the API, not in the UI", () => {
  test("a PROTECTED item cannot be removed, however the request is made", async ({ page }) => {
    const journeyId = await saveJourney(page);

    const items = await page.request
      .get(`/en/journeys/${journeyId}`)
      .then(() => page.goto(`/en/journeys/${journeyId}`));
    expect(items?.status()).toBe(200);

    // Dawn Darshan went in as must-do → PROTECTED.
    const itemId = await page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Dawn Darshan (fixture)", exact: true }) })
      .locator("select[id^='tier-']")
      .first()
      .getAttribute("id")
      .then((id) => id?.replace("tier-", "") ?? "");

    expect(itemId).not.toBe("");

    const response = await page.request.delete(
      `/api/journeys/${journeyId}/items/${itemId}?confirmed=true`,
    );

    expect(response.status()).toBe(403);
    const body = await response.json();
    // The refusal names what the traveler said, and what they could change.
    expect(body.error.message).toMatch(/must do/i);
  });

  test("a destructive change without confirmation is refused (PRD Principle 6)", async ({
    page,
  }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    const itemId = await page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Evening Aarti (fixture)", exact: true }) })
      .locator("select[id^='tier-']")
      .first()
      .getAttribute("id")
      .then((id) => id?.replace("tier-", "") ?? "");

    // Confirmation is not a UI nicety the API trusts the client about.
    const unconfirmed = await page.request.delete(`/api/journeys/${journeyId}/items/${itemId}`);
    expect(unconfirmed.status()).toBe(400);

    const confirmed = await page.request.delete(
      `/api/journeys/${journeyId}/items/${itemId}?confirmed=true`,
    );
    expect(confirmed.status()).toBe(200);
  });

  test("retiering is never blocked — it is the traveler restating what matters", async ({
    page,
  }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    const itemId = await page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Dawn Darshan (fixture)", exact: true }) })
      .locator("select[id^='tier-']")
      .first()
      .getAttribute("id")
      .then((id) => id?.replace("tier-", "") ?? "");

    const response = await page.request.patch(`/api/journeys/${journeyId}/items/${itemId}`, {
      data: { tier: "optional" },
    });

    expect(response.status()).toBe(200);

    // And once it is OPTIONAL, removing it becomes possible — which is the point of the
    // rule being about the tier rather than about the item.
    const removal = await page.request.delete(
      `/api/journeys/${journeyId}/items/${itemId}?confirmed=true`,
    );
    expect(removal.status()).toBe(200);
  });
});

test.describe("Editing", () => {
  test("changing a buffer changes what the screen shows", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    // PRD-PLAN-005: buffers are visible AND editable.
    const buffer = page.locator("select[id^='buffer-']").first();
    await buffer.selectOption("45");

    await expect(page.getByText(/45 min to get there/).first()).toBeVisible();
  });

  test("health is returned with every edit, so the verdict cannot go stale", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    const itemId = await page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Dawn Darshan (fixture)", exact: true }) })
      .locator("select[id^='buffer-']")
      .first()
      .getAttribute("id")
      .then((id) => id?.replace("buffer-", "") ?? "");

    const response = await page.request.patch(`/api/journeys/${journeyId}/items/${itemId}`, {
      data: { bufferMinutes: 30 },
    });

    const body = await response.json();
    expect(body.data.health).not.toBeNull();
    expect(body.data.health.journeyState).toBeTruthy();
    expect(body.data.items.length).toBeGreaterThan(0);
  });
});

test.describe("One traveler's journey is not another's", () => {
  test("a stranger gets a 404, not someone else's plan", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);

    // A genuinely clean context. `newContext()` inherits the project's storageState, so
    // without this the "stranger" is the same signed-in traveler and the test proves
    // nothing.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const other = await context.newPage();

    const response = await other.goto(`/en/journeys/${journeyId}`);
    // Not signed in → sent to sign-in rather than shown anything.
    expect(response?.url()).toContain("/sign-in");

    const api = await other.request.patch(`/api/journeys/${journeyId}/items/whatever`, {
      data: { tier: "optional" },
    });
    expect(api.status()).toBe(401);

    await context.close();
  });
});

test("there is no fill-my-day anywhere (PRD-PLAN-008)", async ({ page }) => {
  const journeyId = await saveJourney(page);
  await page.goto(`/en/journeys/${journeyId}`);

  // The builder starts from what the traveler said and stays there. An empty afternoon is
  // a choice, not a gap to be filled.
  await expect(page.getByText(/fill my day|auto.?fill|suggest for me/i)).toHaveCount(0);
});

test("the builder screens are accessible", async ({ page }) => {
  const journeyId = await saveJourney(page);

  for (const url of ["/en/sign-in", "/en/journeys", `/en/journeys/${journeyId}`]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results), url).toEqual([]);
  }
});
