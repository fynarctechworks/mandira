import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Destination and place editors (B-009, OPS-EDIT-01/02).
 *
 * These write real rows through the real server actions, so they exercise the whole path:
 * Zod validation, the role check, RLS, and the PostGIS conversion. Slugs are suffixed per
 * run so repeated runs do not collide on the unique constraint.
 *
 * Session comes from the ops-setup project (signed in as the seeded admin).
 */
const RUN = `e2e-${Date.now().toString(36)}`;

test.describe("Knowledge editors", () => {
  test("creates a destination, then a place inside it", async ({ page }) => {
    // ── Destination ───────────────────────────────────────────────────────────
    await page.goto("/destinations/new");

    await page.getByRole("tabpanel").first().getByRole("textbox").fill("E2E Test Destination");
    await page.getByLabel("Slug").fill(`${RUN}-destination`);
    await page.getByLabel("Region").fill("Test Region");
    await page.getByLabel("Latitude").fill("25.3109");
    await page.getByLabel("Longitude").fill("83.0107");

    await page.getByRole("button", { name: "Create destination" }).click();

    // Landing on the edit page means the row was created and read back.
    await expect(page.getByRole("heading", { name: "E2E Test Destination" })).toBeVisible();
    await expect(page.getByLabel("Latitude")).toHaveValue("25.3109");

    // ── Place, with opening hours ─────────────────────────────────────────────
    await page.goto("/places/new");

    await page.getByRole("tabpanel").first().getByRole("textbox").fill("E2E Test Temple");
    await page.getByLabel("Slug").fill(`${RUN}-temple`);
    await page.getByLabel("Type").selectOption("temple");

    // Record Monday hours, then add the split that temples normally have.
    const monday = page.locator("li", { hasText: "Monday" }).first();
    await monday.getByRole("button", { name: "Add hours" }).click();
    await monday.getByLabel("Monday opening time 1").fill("06:00");
    await monday.getByLabel("Monday closing time 1").fill("12:00");
    await monday.getByRole("button", { name: "Add split" }).click();
    await monday.getByLabel("Monday opening time 2").fill("16:00");
    await monday.getByLabel("Monday closing time 2").fill("21:00");

    await page.getByRole("button", { name: "Create place" }).click();

    await expect(page.getByRole("heading", { name: "E2E Test Temple" })).toBeVisible();
    // The schedule must survive the round-trip through jsonb.
    await expect(
      page.locator("li", { hasText: "Monday" }).first().getByLabel("Monday closing time 2"),
    ).toHaveValue("21:00");
  });

  test("refuses a malformed slug with an inline message, not a crash", async ({ page }) => {
    await page.goto("/destinations/new");

    await page.getByRole("tabpanel").first().getByRole("textbox").fill("Bad Slug Destination");
    await page.getByLabel("Slug").fill("Not A Slug");
    await page.getByRole("button", { name: "Create destination" }).click();

    await expect(page.getByText("Use lowercase words separated by hyphens")).toBeVisible();
    // Still on the form, with the entered values intact.
    await expect(page.getByLabel("Slug")).toHaveValue("Not A Slug");
  });

  test("will not accept half a coordinate pair", async ({ page }) => {
    await page.goto("/destinations/new");

    await page.getByRole("tabpanel").first().getByRole("textbox").fill("Half Coordinates");
    await page.getByLabel("Slug").fill(`${RUN}-half-coords`);
    await page.getByLabel("Latitude").fill("25.3109");

    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByText("Set both latitude and longitude, or neither")).toBeVisible();
  });

  test("the destinations list and its editor are accessible", async ({ page }) => {
    await page.goto("/destinations");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);

    await page.goto("/destinations/new");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });

  test("the places editor is accessible", async ({ page }) => {
    await page.goto("/places/new");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
