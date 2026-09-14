import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * O01 Knowledge health and O22 Product signals (PRD F20).
 *
 * Both read one aggregate SQL function each, so what a browser can check is that the screen
 * says what the numbers are about, links every queue to the screen that works it, and never
 * shows anything that identifies a traveler.
 */
test.describe("O01 — Knowledge health", () => {
  test("shows trust, queues, locales, destinations and jobs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();

    for (const section of [
      "Queues",
      "Locale completeness",
      "Destinations by depth",
      "Scheduled jobs",
    ]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
  });

  test("links every queue to the screen that works it", async ({ page }) => {
    await page.goto("/");
    const queues = page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Queue" }) });

    for (const [label, href] of [
      ["Review", "/review"],
      ["Verify", "/verify"],
      ["Conflicts", "/conflicts"],
      ["Approve & publish", "/publish"],
      ["Reports", "/reports"],
      ["Re-verification", "/freshness"],
    ] as const) {
      await expect(queues.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  test("says a job's state in words, not colour alone", async ({ page }) => {
    await page.goto("/");
    const jobs = page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Job" }) });
    await expect(jobs.getByRole("cell", { name: "publish_scheduled_entities" })).toBeVisible();
    await expect(
      jobs.getByText(/On schedule|Missed runs|Last run did not succeed/).first(),
    ).toBeVisible();
  });

  test("the dashboard is accessible", async ({ page }) => {
    await page.goto("/");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});

test.describe("O22 — Product signals", () => {
  test("keeps the time window in the URL", async ({ page }) => {
    await page.goto("/signals");
    await expect(page.getByRole("heading", { name: "Product signals" })).toBeVisible();

    // A click that lands while the page is still hydrating can be dropped (see admin.spec O20),
    // so the step is retried until the window it asked for is in the URL.
    await expect(async () => {
      await page.getByRole("link", { name: "Last 7 days" }).click();
      await expect(page).toHaveURL(/days=7/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("shows counts only — no identifier reaches the screen", async ({ page }) => {
    await page.goto("/signals?days=90");
    const text = await page.getByRole("main").innerText();

    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(text).not.toMatch(/anon_session_id|journey_id/);
  });

  test("shows what journeys did, as counts and shares", async ({ page }) => {
    await page.goto("/signals?days=90");
    for (const section of ["Journeys", "Health at departure"]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Reports per 1,000 journey-days")).toBeVisible();
  });

  test("product signals are accessible", async ({ page }) => {
    await page.goto("/signals");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
