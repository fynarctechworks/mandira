import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Profile & travelers (PRD F13, A23) and the DPDP controls (PRD-PRIV-003/004).
 *
 * The deletion test requests erasure of the suite's own traveler and then keeps the account —
 * and keeps it again after every test regardless, so a failed assertion can never leave the
 * shared account scheduled for purge.
 */
test.describe("A guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is offered sign-in and can still choose a language", async ({ page }) => {
    await page.goto("/en/profile");

    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/en/sign-in?next=${encodeURIComponent("/en/profile")}`,
    );
    await expect(page.getByLabel("Language")).toBeVisible();
  });

  test("cannot export or delete anything", async ({ page }) => {
    expect((await page.request.post("/api/account/export")).status()).toBe(401);
    expect(
      (await page.request.post("/api/account/delete", { data: { confirm: true } })).status(),
    ).toBe(401);
  });
});

test.describe("A signed-in traveler", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async ({ page }) => {
    await page.request.delete("/api/account/delete");
  });

  test("sees their account, and the page passes axe", async ({ page }) => {
    await page.goto("/en/profile");

    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(page.getByText(/@mandhira\.local/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Choose what Mandhira tells you about/ }),
    ).toHaveAttribute("href", "/en/notifications");

    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });

  test("downloads a copy of their data", async ({ page }) => {
    await page.goto("/en/profile");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^mandhira-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(data.account.email).toMatch(/@mandhira\.local$/);
    expect(Array.isArray(data.journeys)).toBe(true);
  });

  test("the export route answers with an attachment", async ({ page }) => {
    const response = await page.request.post("/api/account/export");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename=/);
  });

  test("asks to delete, is told when, and keeps the account", async ({ page }) => {
    await page.goto("/en/profile");

    await page.getByRole("button", { name: "Delete my account" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete my account" }).click();

    await expect(page.getByText(/Your account will be erased on/)).toBeVisible();

    // Survives a reload: the date comes from the account, not from the tap.
    await page.reload();
    await expect(page.getByText(/Your account will be erased on/)).toBeVisible();

    await page.getByRole("button", { name: "Keep my account" }).click();
    await expect(page.getByText("Your account is staying.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();
  });

  test("deletion refuses a request without confirmation", async ({ page }) => {
    const response = await page.request.post("/api/account/delete", { data: {} });
    expect(response.status()).toBe(400);
  });

  test("adds, edits and removes a traveler", async ({ page }) => {
    const name = `Amma ${Date.now()}`;
    await page.goto("/en/profile");

    await page.getByRole("button", { name: "Add a traveler" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name or relation").fill(name);
    await sheet.getByLabel("Getting around").selectOption("limited_walking");
    await sheet.getByLabel("Age group").selectOption("senior");
    await sheet.getByRole("button", { name: "Save traveler" }).click();

    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toContainText("Can't walk far");
    await expect(row).toContainText("Senior");

    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("dialog").getByLabel("Getting around").selectOption("wheelchair");
    await page.getByRole("dialog").getByRole("button", { name: "Save traveler" }).click();
    await expect(row).toContainText("Uses a wheelchair");

    await page.getByRole("button", { name: `Remove ${name}` }).click();
    const confirm = page.getByRole("alertdialog", { name: `Remove ${name}?` });
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  });

  test("switches language in the URL, and back", async ({ page }) => {
    await page.goto("/en/profile");

    await page.getByLabel("Language").selectOption("te");
    await expect(page).toHaveURL(/\/te\/profile$/);

    await page.getByLabel(/Language|భాష/).selectOption("en");
    await expect(page).toHaveURL(/\/en\/profile$/);
  });
});
