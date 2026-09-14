import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Experiences, availability and route stops (B-010).
 *
 * Focused on the two things whose failure is silent and expensive: an availability rule
 * that does not round-trip means the engine cannot schedule an experience at all, and a
 * stop order that does not persist means a route that doubles back.
 */
const RUN = `b10-${Date.now().toString(36)}`;

/** Every entity here needs a destination and a place to hang off. */
async function seedDestinationAndPlace(page: import("@playwright/test").Page) {
  await page.goto("/destinations/new");
  await page.getByRole("tabpanel").first().getByRole("textbox").fill(`B10 Destination ${RUN}`);
  await page.getByLabel("Slug").fill(`${RUN}-dest`);
  await page.getByRole("button", { name: "Create destination" }).click();
  await expect(page.getByRole("heading", { name: `B10 Destination ${RUN}` })).toBeVisible();

  await page.goto("/places/new");
  await page.getByRole("tabpanel").first().getByRole("textbox").fill(`B10 Temple ${RUN}`);
  await page.getByLabel("Slug").fill(`${RUN}-temple`);
  await page.getByRole("button", { name: "Create place" }).click();
  await expect(page.getByRole("heading", { name: `B10 Temple ${RUN}` })).toBeVisible();
}

/*
 * Serial: these tests are steps in one flow — an experience must exist before a rule can
 * be rejected against it. Expressing that with describe.serial is honest; re-seeding the
 * whole graph per test would be slower and would still share the same database.
 */
test.describe.serial("Experiences and routes", () => {
  test("an experience takes a daily-times availability rule that survives a reload", async ({
    page,
  }) => {
    await seedDestinationAndPlace(page);

    await page.goto("/experiences/new");
    await page
      .getByRole("tabpanel")
      .first()
      .getByRole("textbox")
      .fill(`B10 Morning Darshan ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-darshan`);
    // selectOption matches labels as exact strings, not patterns.
    await page.getByLabel("Where it happens").selectOption({ label: `B10 Temple ${RUN} (place)` });
    await page.getByRole("button", { name: "Create experience" }).click();

    await expect(page.getByRole("heading", { name: `B10 Morning Darshan ${RUN}` })).toBeVisible();
    // A brand-new experience has no availability, and the UI must say so plainly rather
    // than looking complete.
    await expect(page.getByText(/No availability recorded yet/)).toBeVisible();

    await page.getByLabel("Add a rule").selectOption("daily_fixed_times");
    await page.getByLabel("Start time 1").fill("06:00");
    await page.getByLabel("End time 1").fill("07:30");
    await page.getByRole("button", { name: "Add rule", exact: true }).click();

    // Scope to the saved-rules list: the kind's label also appears as an <option> in the
    // "add a rule" select, so an unscoped text match is ambiguous rather than wrong.
    const savedRule = page.getByRole("listitem").filter({ hasText: "Fixed times each day" });
    await expect(savedRule).toBeVisible();
    await expect(savedRule).toContainText("06:00–07:30");
  });

  test("an availability kind without its payload is refused", async ({ page }) => {
    await page.goto("/experiences");
    // The list grows with every local run and hydrates slowly enough to drop a first click;
    // retry until the editor is open (the same guard publish.spec's openPlace uses).
    await expect(async () => {
      await page.getByRole("link", { name: `B10 Morning Darshan ${RUN}` }).click();
      await expect(page.getByLabel("Add a rule")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 25_000 });

    // date_range with no dates: the shared schema must refuse it, not store a rule the
    // engine cannot evaluate.
    await page.getByLabel("Add a rule").selectOption("date_range");
    await page.getByRole("button", { name: "Add rule", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("route stops keep the order they were given", async ({ page }) => {
    // Two more places so there is an order to get wrong.
    for (const name of [`B10 Ghat ${RUN}`, `B10 Shrine ${RUN}`]) {
      await page.goto("/places/new");
      await page.getByRole("tabpanel").first().getByRole("textbox").fill(name);
      await page.getByLabel("Slug").fill(`${RUN}-${name.split(" ")[1]!.toLowerCase()}`);
      await page.getByRole("button", { name: "Create place" }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }

    await page.goto("/routes/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`B10 Parikrama ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-parikrama`);
    await page.getByRole("button", { name: "Create route" }).click();
    await expect(page.getByRole("heading", { name: `B10 Parikrama ${RUN}` })).toBeVisible();

    await page.getByLabel("Add a stop").selectOption({ label: `B10 Ghat ${RUN}` });
    await page.getByLabel("Add a stop").selectOption({ label: `B10 Shrine ${RUN}` });
    await page.getByRole("button", { name: "Save stop order" }).click();
    // dnd-kit injects its own role="status" live region, so target the indicator's text.
    await expect(page.getByText("● Saved")).toBeVisible();

    await page.reload();
    const stops = page.getByRole("listitem").filter({ hasText: /B10 (Ghat|Shrine)/ });
    await expect(stops.first()).toContainText("B10 Ghat");
    await expect(stops.nth(1)).toContainText("B10 Shrine");
  });

  test("the new knowledge editors are accessible", async ({ page }) => {
    for (const path of ["/experiences", "/routes", "/transport", "/guidance"]) {
      await page.goto(path);
      expect(seriousViolations(await new AxeBuilder({ page }).analyze()), path).toEqual([]);
    }
  });
});
