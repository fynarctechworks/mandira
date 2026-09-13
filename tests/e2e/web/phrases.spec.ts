import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Phrase assistance (A17, PRD F12, PRD-LANG-004).
 *
 * Guest-readable, so this runs signed out in `web-mobile`. The fixture destination publishes
 * two phrases with Telugu translations (seed 0002): one for directions, one asking for help.
 */
const DESTINATION = "/en/destinations/fixture-devagiri";
const TEMPLE = `${DESTINATION}/places/fixture-hill-temple`;
const PHRASES = `${DESTINATION}/phrases`;

test.describe("Phrase assistance", () => {
  test("is reachable from the destination page", async ({ page }) => {
    await page.goto(DESTINATION);
    await page.getByRole("link", { name: "Phrases to show or play" }).click();

    await expect(page).toHaveURL(new RegExp("/destinations/fixture-devagiri/phrases$"));
    await expect(page.getByRole("heading", { level: 1, name: "Phrases" })).toBeVisible();
  });

  test("is reachable from a place page", async ({ page }) => {
    await page.goto(TEMPLE);
    await page.getByRole("link", { name: "Phrases to show or play" }).click();

    await expect(page).toHaveURL(new RegExp("/destinations/fixture-devagiri/phrases$"));
  });

  test("groups phrases by situation, with the local text, how to say it, and the meaning", async ({
    page,
  }) => {
    await page.goto(PHRASES);

    await expect(page.getByRole("tab", { name: "Directions" })).toBeVisible();
    await expect(page.getByText("తూర్పు ద్వారం ఎక్కడ ఉంది?")).toBeVisible();
    await expect(page.getByText("turpu dvaram ekkada undi?")).toBeVisible();
    await expect(page.getByText("Where is the east gate?")).toBeVisible();

    await page.getByRole("tab", { name: "Help" }).click();
    await expect(page.getByText("We need to sit down for a while.")).toBeVisible();
    await expect(page.getByText("మేము కొంతసేపు కూర్చోవాలి.")).toBeVisible();
  });

  test("shows a phrase full screen for someone to read, and closes again", async ({ page }) => {
    await page.goto(PHRASES);
    await page.getByRole("button", { name: "Show to someone: Where is the east gate?" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("తూర్పు ద్వారం ఎక్కడ ఉంది?")).toBeVisible();

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
  });

  test("an unknown destination has no phrase page", async ({ page }) => {
    const response = await page.goto("/en/destinations/no-such-destination/phrases");
    expect(response?.status()).toBe(404);
  });

  test("has no serious accessibility violations", async ({ page }) => {
    await page.goto(PHRASES);
    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});
