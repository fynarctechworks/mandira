import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * OPS-REL-01 — relationships and circuits (PRD-OPS-CNT-002, PRD F19).
 *
 * Nearby destinations from the destination editor, circuits in order, and what a place is
 * connected to.
 */
const RUN = `rel-${Date.now().toString(36)}`;

async function createDestination(page: Page, name: string, slug: string): Promise<string> {
  await page.goto("/destinations/new");
  await page.getByRole("tabpanel").first().getByRole("textbox").fill(name);
  await page.getByLabel("Slug").fill(slug);
  await page.getByRole("button", { name: "Create destination" }).click();
  // A write and a redirect; beside two other workers it has taken longer than the default.
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 15_000 });
  return page.url();
}

test.describe.serial("OPS-REL-01 — Relationships and circuits", () => {
  test("links nearby destinations with a note, and removes one", async ({ page }) => {
    await createDestination(page, `Rel B ${RUN}`, `${RUN}-b`);
    await createDestination(page, `Rel C ${RUN}`, `${RUN}-c`);
    const editor = await createDestination(page, `Rel A ${RUN}`, `${RUN}-a`);

    const nearby = page.getByRole("region", { name: "Nearby destinations" });
    const noteB = nearby.getByRole("group", { name: `Note about Rel B ${RUN}` });
    const noteC = nearby.getByRole("group", { name: `Note about Rel C ${RUN}` });

    // A change that lands before hydration can be dropped; retry until the link appears.
    await expect(async () => {
      await nearby.getByLabel("Add a nearby destination").selectOption({ label: `Rel B ${RUN}` });
      await expect(noteB).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 25_000 });
    await nearby.getByLabel("Add a nearby destination").selectOption({ label: `Rel C ${RUN}` });
    await noteB.getByRole("textbox").fill("Two hours by road");
    await nearby.getByRole("button", { name: "Save nearby destinations" }).click();
    await expect(nearby.getByRole("status")).toContainText("Saved");

    await page.goto(editor);
    await expect(noteB.getByRole("textbox")).toHaveValue("Two hours by road");
    await expect(noteC).toBeVisible();

    await expect(async () => {
      await nearby.getByRole("button", { name: `Remove Rel C ${RUN}` }).click();
      await expect(noteC).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 25_000 });
    await nearby.getByRole("button", { name: "Save nearby destinations" }).click();
    await expect(nearby.getByRole("status")).toContainText("Saved");

    await page.goto(editor);
    await expect(noteB).toBeVisible();
    await expect(noteC).toHaveCount(0);
  });

  test("builds a circuit of destinations in order", async ({ page }) => {
    await page.goto("/circuits/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Rel Circuit ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-circuit`);
    await page.getByRole("button", { name: "Create circuit" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Rel Circuit ${RUN}` })).toBeVisible();
    const editor = page.url();

    const order = page.getByRole("region", { name: "Destinations in order" });
    await expect(async () => {
      await order.getByLabel("Add a destination").selectOption({ label: `Rel A ${RUN}` });
      await expect(order.getByRole("listitem")).toHaveCount(1, { timeout: 5_000 });
    }).toPass({ timeout: 25_000 });
    await order.getByLabel("Add a destination").selectOption({ label: `Rel B ${RUN}` });
    await order.getByRole("button", { name: `Move Rel B ${RUN} up` }).click();
    await expect(order.getByRole("listitem").first()).toContainText(`Rel B ${RUN}`);
    await order.getByRole("button", { name: "Save order" }).click();
    await expect(order.getByRole("status")).toContainText("Saved");

    await page.goto(editor);
    await expect(order.getByRole("listitem").first()).toContainText(`Rel B ${RUN}`);
    await expect(order.getByRole("listitem").nth(1)).toContainText(`Rel A ${RUN}`);
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);

    await page.goto("/circuits");
    const row = page.getByRole("row").filter({ hasText: `Rel Circuit ${RUN}` });
    await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  });

  test("shows what a place is connected to", async ({ page }) => {
    await page.goto("/places/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Rel Temple ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-temple`);
    await page.getByLabel("Type").selectOption("temple");
    await page.getByRole("button", { name: "Create place" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Rel Temple ${RUN}` })).toBeVisible();

    const connections = page.getByRole("region", { name: "Connections" });
    for (const heading of [
      "Experiences here",
      "Routes that stop here",
      "Facilities within 500 metres",
    ]) {
      await expect(connections.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(connections.getByText("None yet.").first()).toBeVisible();
  });
});
