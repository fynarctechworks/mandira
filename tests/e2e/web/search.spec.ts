import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Search and filters (B-015 third slice, SRCH-01, PRD F2 / A03).
 *
 * The search screen is a plain GET form, so most of what matters here is that a result is
 * a URL: shareable, back-button-able, and reachable with no JavaScript running. A traveler
 * on a hill with one bar gets a page rather than a spinner.
 */
test.describe("Search", () => {
  test("runs from the home screen in one interaction", async ({ page }) => {
    await page.goto("/en");

    await page.getByRole("searchbox", { name: /Search places and experiences/ }).fill("darshan");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/\/en\/search\?q=darshan/);
    await expect(page.getByRole("heading", { name: "Dawn Darshan (fixture)" })).toBeVisible();
  });

  test("a search is a URL, so it survives a reload", async ({ page }) => {
    await page.goto("/en/search?q=darshan");
    await page.reload();

    await expect(page.getByRole("heading", { name: "Experiences" })).toBeVisible();
    // The box keeps what was typed, so refining does not mean retyping.
    await expect(page.getByRole("searchbox", { name: /looking for/ })).toHaveValue("darshan");
  });

  test("groups results by kind", async ({ page }) => {
    await page.goto("/en/search?access=step_free");

    await expect(page.getByRole("heading", { name: "Experiences" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Places" })).toBeVisible();
  });

  test("says how many results, for a screen reader as well", async ({ page }) => {
    await page.goto("/en/search?q=darshan");
    await expect(page.getByRole("status")).toContainText("2 results");
  });

  test.describe("filters", () => {
    test("booking narrows to the one that needs it, and drops places", async ({ page }) => {
      await page.goto("/en/search?booking=yes");

      await expect(page.getByRole("heading", { name: "Dawn Darshan (fixture)" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Evening Aarti (fixture)" })).toHaveCount(0);
      // A place is not something you book; the filter excludes them rather than
      // pretending every place satisfies it.
      await expect(page.getByRole("heading", { name: "Places" })).toHaveCount(0);
    });

    test("a place type returns places and no experiences", async ({ page }) => {
      await page.goto("/en/search?type=temple");

      await expect(page.getByRole("heading", { name: "Hill Temple (fixture)" })).toBeVisible();
      // The two enums do not overlap, and matching everything in the other group would
      // make the filter look broken.
      await expect(page.getByRole("heading", { name: "Experiences" })).toHaveCount(0);
    });

    test("step-free includes partly step-free, and excludes the unrecorded", async ({ page }) => {
      await page.goto("/en/search?access=step_free");

      // Hill Temple is `partial` — worth showing to the person who needs the ramp.
      await expect(page.getByRole("heading", { name: "Hill Temple (fixture)" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "East Gate (fixture)" })).toBeVisible();
      // Prasadam Hall has no record at all. A filter is a claim, and there is nothing to
      // claim about it.
      await expect(page.getByRole("heading", { name: "Prasadam Hall (fixture)" })).toHaveCount(0);
    });

    test("duration excludes what takes longer", async ({ page }) => {
      await page.goto("/en/search?duration=60");

      // Dawn Darshan is 90 minutes.
      await expect(page.getByRole("heading", { name: "Dawn Darshan (fixture)" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "General Darshan (fixture)" })).toBeVisible();
    });

    test("keeps its selections after searching, so refining is possible", async ({ page }) => {
      await page.goto("/en/search?booking=yes&duration=120");

      await expect(page.getByLabel("Booking")).toHaveValue("yes");
      await expect(page.getByLabel("How long")).toHaveValue("120");
    });

    test("says which filters are still to come, rather than showing dead controls", async ({
      page,
    }) => {
      await page.goto("/en/search");

      // A control that is always there and never works teaches people the controls do not
      // work, and they stop trying the ones that do.
      await expect(page.getByText(/arrives with the journey builder/)).toBeVisible();
    });
  });

  test.describe("empty states", () => {
    test("a query that matched nothing suggests different words", async ({ page }) => {
      await page.goto("/en/search?q=zzznothinghere");
      await expect(page.getByText(/Try a different word/)).toBeVisible();
    });

    test("filters that matched nothing suggest removing one", async ({ page }) => {
      // Told to loosen a filter, not to rephrase — the problem is the filter they set.
      await page.goto("/en/search?type=ghat");
      await expect(page.getByText(/Try removing one/)).toBeVisible();
    });

    test("an unsearched screen explains what it searches", async ({ page }) => {
      await page.goto("/en/search");
      await expect(page.getByText(/Search published places and experiences/)).toBeVisible();
    });
  });

  test("never returns anything the publish gate holds back", async ({ page }) => {
    await page.goto("/en/search?q=shrine");

    // The Unready Shrine is `published` with only one of three critical fields reviewed.
    await expect(page.getByText("Unready Shrine")).toHaveCount(0);
  });

  test("the search screen is accessible", async ({ page }) => {
    await page.goto("/en/search?q=darshan");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});
