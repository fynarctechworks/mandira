import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Discovery (B-015, PRD F2 / F9).
 *
 * Runs against the local fixture destination, which exists precisely so these assertions
 * have all three trust states and all three accessibility cases to check. Guest-first:
 * nothing here needs an account.
 *
 * The assertions that matter most are the ones about what is NOT shown. A discovery
 * surface that renders an unpublished place, or shows "Verified" on a conflicted field,
 * fails in a way a traveler cannot detect — which is the whole reason the trust model
 * exists.
 */
const DESTINATION = "/en/destinations/fixture-devagiri";

test.describe("Discovery", () => {
  test("home lists a published destination and links to it", async ({ page }) => {
    await page.goto("/en");

    const link = page.getByRole("link", { name: /Devagiri \(fixture\)/ });
    await expect(link).toBeVisible();

    await link.click();
    await expect(page).toHaveURL(new RegExp("/destinations/fixture-devagiri$"));
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Devagiri (fixture)");
  });

  test("shows what people come here for, ranked by editorial weight", async ({ page }) => {
    await page.goto(DESTINATION);

    const section = page.getByRole("region", { name: "What people come here for" });
    const headings = section.getByRole("heading", { level: 3 });

    // Dawn Darshan and Evening Aarti carry weight 5, General Darshan 3. PRD F2: never
    // ranked by popularity — the order is a judgement Ops is accountable for.
    await expect(headings.first()).not.toContainText("General Darshan");
    await expect(headings).toHaveCount(3);
  });

  test("an experience card carries everything PRD F2 requires of it", async ({ page }) => {
    await page.goto(DESTINATION);

    const card = page.locator("article").filter({ hasText: "Dawn Darshan (fixture)" });

    await expect(card).toContainText("Daily");
    await expect(card).toContainText("Usually");
    // The sixty-days-notice case is exactly the one a traveler must not miss.
    await expect(card).toContainText("Advance booking required — opens 60 days before");
  });

  test("an experience with no booking requirement says nothing about booking", async ({ page }) => {
    await page.goto(DESTINATION);

    // Scoped to the experience cards: the aarti also appears under Rituals and events (D-191).
    const card = page
      .getByRole("region", { name: "What people come here for" })
      .locator("article")
      .filter({ hasText: "Evening Aarti (fixture)" });
    await expect(card).not.toContainText("Advance booking");
  });

  test.describe("trust", () => {
    test("renders all three badge states, not just the reassuring one", async ({ page }) => {
      await page.goto(DESTINATION);

      // A surface that has only ever rendered "Verified" is a surface where the other two
      // have never been seen by anyone.
      await expect(page.getByText("Verified", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Verified earlier").first()).toBeVisible();
      await expect(page.getByText("Check locally").first()).toBeVisible();
    });

    test("a conflicted field pulls its card down to Check locally", async ({ page }) => {
      await page.goto(DESTINATION);

      // Dawn Darshan is verified by a T1 source but its booking instructions conflict.
      // The card must show the weakest state, not the flattering one.
      const card = page.locator("article").filter({ hasText: "Dawn Darshan (fixture)" });
      await expect(card.getByText("Check locally")).toBeVisible();
    });

    test("the page footer names its sources and the OLDEST verification", async ({ page }) => {
      await page.goto(DESTINATION);

      // The footer is a labelled region, in the catalog wording (D-194).
      const footer = page.getByLabel("Sources and freshness");
      await expect(footer).toBeVisible();
      await expect(footer.getByText(/Fixture Temple Authority/)).toBeVisible();
    });
  });

  test.describe("accessibility information", () => {
    test("shows partial as its own answer, not rounded to yes or no", async ({ page }) => {
      await page.goto(DESTINATION);

      const card = page.locator("article").filter({ hasText: "Hill Temple (fixture)" });
      await expect(card).toContainText("partly");
    });

    test("says plainly when nothing has been recorded", async ({ page }) => {
      await page.goto(DESTINATION);

      // For a wheelchair user, silence reads as "it has none of these" — which is a
      // different and possibly false claim (D-080).
      const card = page.locator("article").filter({ hasText: "Prasadam Hall (fixture)" });
      await expect(card).toContainText("don't have accessibility information");
    });
  });

  test("never shows a place the publish gate holds back", async ({ page }) => {
    await page.goto(DESTINATION);

    // The Unready Shrine has status = 'published' but only one of three critical fields
    // reviewed. If this ever appears, the gate has stopped working.
    await expect(page.getByText("Unready Shrine")).toHaveCount(0);
  });

  test("a destination that does not exist is a 404, not a blank page", async ({ page }) => {
    const response = await page.goto("/en/destinations/not-a-real-destination");
    expect(response?.status()).toBe(404);
  });

  test("the destination page is accessible", async ({ page }) => {
    await page.goto(DESTINATION);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});
