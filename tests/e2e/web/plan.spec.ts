import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The structured brief and the journey it produces (PRD F3's second path, PRD F4, PRD F5).
 *
 * This is the first screen where the engine's output reaches a person, so the assertions
 * are about whether it says something TRUE rather than whether it says something. A plan
 * that looks plausible and is wrong is the failure this whole product is built against.
 */
const PLAN = "/en/plan";

/** Picks the named experiences in a section, by their visible label. */
async function choose(page: Page, group: "must" | "like", names: string[]) {
  for (const name of names) {
    await page.locator(`input[name="${group}"]`).locator("..").filter({ hasText: name }).click();
  }
}

test.describe("The brief form", () => {
  test("is reachable from the home screen", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("link", { name: "Plan a journey" }).click();

    await expect(page).toHaveURL(/\/en\/plan$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan a journey");
  });

  test("asks for a destination and dates, and nothing else is required", async ({ page }) => {
    await page.goto(PLAN);

    // PRD-INT-002: skip allowed on everything except destination and dates.
    await expect(page.getByLabel("Starting on")).toHaveAttribute("required", "");
    await expect(page.getByLabel("Pace")).not.toHaveAttribute("required", "");
    await expect(page.getByLabel(/mobility need/)).not.toHaveAttribute("required", "");
  });

  test("offers the destination's published experiences to choose from", async ({ page }) => {
    await page.goto(PLAN);

    await expect(page.getByText("Dawn Darshan (fixture)").first()).toBeVisible();
    // The gate still applies on the way in: you cannot plan around something invisible.
    await expect(page.getByText("Unready Shrine")).toHaveCount(0);
  });

  test("builds a journey from what was chosen", async ({ page }) => {
    await page.goto(PLAN);

    await page.getByLabel("Starting on").fill("2026-10-12");
    await choose(page, "must", ["Dawn Darshan (fixture)"]);
    await page.getByRole("button", { name: "Build my journey" }).click();

    await expect(page).toHaveURL(/\/en\/plan\/preview\?/);
    await expect(page.getByRole("heading", { name: "Your journey" })).toBeVisible();
    await expect(page.getByText("Dawn Darshan (fixture)")).toBeVisible();
  });
});

test.describe("The journey it proposes", () => {
  const base = "/en/plan/preview?destination=fixture-devagiri&start=2026-10-12&days=1&pace=full";

  /** Both fixture experiences, by the ids the seed pins. */
  const both =
    "&must=d0000000-0000-4000-8000-00000000f007&must=d0000000-0000-4000-8000-00000000f009";

  test("places each item inside its own availability window", async ({ page }) => {
    await page.goto(`${base}&mobility=full${both}`);

    // Dawn Darshan runs 05:00–08:00 and the day starts at 06:00; the aarti is 18:30–19:30.
    // A schedule that ignored either would look completely normal on screen.
    await expect(page.getByText("6:00 AM")).toBeVisible();
    await expect(page.getByText("6:30 PM")).toBeVisible();
  });

  test("says how the journey holds together, in words and not a score", async ({ page }) => {
    await page.goto(`${base}&mobility=full${both}`);

    await expect(page.getByText("Comfortable — there's room to breathe.")).toBeVisible();
    // PRD F5 forbids a numeric score; a percentage here would be something a traveler has
    // to interpret, and they would interpret it differently from us.
    await expect(page.getByText(/\d+\s*%/)).toHaveCount(0);
  });

  test.describe("physical load reaches the screen (PRD-HLTH-005)", () => {
    test("a wheelchair pulls a partly step-free day down to Tight, and says why", async ({
      page,
    }) => {
      await page.goto(`${base}&mobility=wheelchair${both}`);

      // The whole chain: accessibility_records.step_free = 'partial' → the published view
      // → the engine's check → an i18n key → this sentence.
      await expect(page.getByText("only partly step-free")).toBeVisible();
      await expect(page.getByText(/Tight — workable/)).toBeVisible();
    });

    test("someone who needs to rest often is told where the gap is", async ({ page }) => {
      await page.goto(`${base}&mobility=needs_rest_frequently${both}`);

      await expect(page.getByText(/without a proper break/)).toBeVisible();
    });

    test("and none of that appears for a group that walks freely", async ({ page }) => {
      await page.goto(`${base}&mobility=full${both}`);

      // A warning shown to everyone is a warning nobody reads.
      await expect(page.getByText("only partly step-free")).toHaveCount(0);
      await expect(page.getByText(/without a proper break/)).toHaveCount(0);
    });
  });

  test("marks each item with the tier the traveler gave it", async ({ page }) => {
    await page.goto(
      `${base}&mobility=full&must=d0000000-0000-4000-8000-00000000f007&like=d0000000-0000-4000-8000-00000000f009`,
    );

    // The chip is the traveler's own statement of what matters, and it is what the engine
    // will and will not touch when a day stops working.
    await expect(page.getByText("PROTECTED")).toBeVisible();
    await expect(page.getByText("IMPORTANT")).toBeVisible();
  });

  test("offers to keep the plan, and says an account is needed before you tap", async ({
    page,
  }) => {
    await page.goto(`${base}&mobility=full${both}`);

    await expect(page.getByRole("button", { name: "Keep this journey" })).toBeVisible();

    // Said BEFORE the tap, not after. Finding out at the moment of saving reads as a toll
    // gate rather than as the thing that keeps your journey.
    await expect(page.getByText(/needs an account/)).toBeVisible();
  });

  test("says so when nothing was chosen, rather than showing an empty day", async ({ page }) => {
    await page.goto(`${base}&mobility=full`);
    await expect(page.getByText(/didn't choose anything to do/)).toBeVisible();
  });

  test("a brief with no destination is a 404", async ({ page }) => {
    const response = await page.goto("/en/plan/preview?start=2026-10-12");
    expect(response?.status()).toBe(404);
  });

  test("the brief and the journey are both accessible", async ({ page }) => {
    for (const url of [PLAN, `${base}&mobility=wheelchair${both}`]) {
      await page.goto(url);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(seriousViolations(results), url).toEqual([]);
    }
  });
});

test.describe("The return guard (PRD-PLAN-006)", () => {
  const base = "/en/plan/preview?destination=fixture-devagiri&start=2026-10-12&days=1&pace=full";
  const darshan = "&must=d0000000-0000-4000-8000-00000000f007";

  test("breaks the journey when the plan cannot reach the return", async ({ page }) => {
    // A 90-minute darshan from 06:00 against a 06:30 train. This is the shape the guard
    // exists for, and it slipped through until B-019 — the day read as Comfortable while
    // the traveler missed their train.
    await page.goto(`${base}&mobility=full${darshan}&return=2026-10-12T06:30`);

    await expect(page.getByText(/reach your return about 60 minutes late/)).toBeVisible();
    await expect(page.getByText(/can't work as planned/)).toBeVisible();
  });

  test("says nothing when there is room to reach it", async ({ page }) => {
    await page.goto(`${base}&mobility=full${darshan}&return=2026-10-12T20:00`);

    await expect(page.getByText(/room to breathe/)).toBeVisible();
    await expect(page.getByText(/reach your return/)).toHaveCount(0);
  });

  test("a brief with no return is planned without one", async ({ page }) => {
    // Optional, like everything else on the form except destination and dates.
    await page.goto(`${base}&mobility=full${darshan}`);

    await expect(page.getByRole("heading", { name: "Your journey" })).toBeVisible();
    await expect(page.getByText(/reach your return/)).toHaveCount(0);
  });
});
