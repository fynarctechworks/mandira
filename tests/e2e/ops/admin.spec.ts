import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * O21 Users, roles & flags · O18 Locales · O20 Audit log & versions.
 *
 * Runs as the seeded admin. The destructive paths are exercised where they must be refused
 * (an admin's own admin role, English as fallback) and the restore path end to end on a
 * destination this suite creates.
 */
const RUN = `adm-${Date.now().toString(36)}`;
const ADMIN = "admin@mandhira.local";

test.describe("O21 — Users, roles & flags", () => {
  test("lists the team with their roles", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Users, roles & flags" })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: ADMIN });
    await expect(row).toBeVisible();
    // Roles read as words now, like every stored value in Ops ("Admin", not "admin").
    await expect(row.getByRole("cell", { name: /^Admin\b/ })).toBeVisible();
  });

  test("never offers an admin the removal of their own admin role", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("button", { name: `Remove admin from ${ADMIN}` })).toHaveCount(0);
  });

  test("granting to an email with no account says what to do", async ({ page }) => {
    await page.goto("/team");
    await page.getByLabel("Email").fill(`nobody-${RUN}@example.org`);
    await page.getByLabel("Role", { exact: true }).selectOption("reviewer");
    await page.getByRole("button", { name: "Grant role" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /No account uses that email/ }),
    ).toBeVisible();
  });

  test("shows feature flags with their state in words", async ({ page }) => {
    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Feature flags" })).toBeVisible();

    const switches = page.getByRole("switch");
    if ((await switches.count()) === 0) {
      await expect(page.getByText(/No feature flags are defined/)).toBeVisible();
      return;
    }
    await expect(page.getByText(/^(On|Off)$/).first()).toBeVisible();
  });

  test("the team screen is accessible", async ({ page }) => {
    await page.goto("/team");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});

test.describe("O18 — Locales", () => {
  test("lists English and refuses to switch off the fallback", async ({ page }) => {
    await page.goto("/locales");
    const english = page.getByRole("row").filter({ hasText: "English" }).first();
    await expect(english).toBeVisible();

    await english.getByRole("switch").click();
    await expect(page.getByRole("alert").filter({ hasText: /fallback/ })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("row").filter({ hasText: "English" }).first().getByRole("switch"),
    ).toBeChecked();
  });

  test("validates a new locale's script code", async ({ page }) => {
    await page.goto("/locales");
    await page.getByLabel("Code").fill("zz");
    await page.getByLabel("Name in its own script").fill("Test");
    await page.getByLabel("English name").fill("Test");
    await page.getByLabel("Script", { exact: true }).fill("latin");
    await page.getByRole("button", { name: "Add locale" }).click();

    await expect(page.getByRole("alert").filter({ hasText: /ISO 15924/ })).toBeVisible();
  });

  test("the locales screen is accessible", async ({ page }) => {
    await page.goto("/locales");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});

test.describe.serial("O20 — Audit log & versions", () => {
  test("keeps its filters in the URL", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

    await page.getByLabel("Entity").selectOption("destinations");
    await page.getByLabel("Action").selectOption("insert");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/table=destinations/);
    await expect(page).toHaveURL(/action=insert/);
  });

  test("records an edit as a new version and restores the earlier one", async ({ page }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Audit Before ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-dest`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `Audit Before ${RUN}` })).toBeVisible();

    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Audit After ${RUN}`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: `Audit After ${RUN}` })).toBeVisible();

    await page.getByRole("link", { name: "History" }).click();
    await expect(
      page.getByRole("heading", { name: `History of Audit After ${RUN}` }),
    ).toBeVisible();

    /*
     * A click that lands while the History navigation is still settling can be dropped, so
     * the step is retried until the version it asked for is on screen.
     *
     * Clicked, not followed by its href with page.goto: a full page load there left the
     * restore below unable to refresh the page's title, so the in-app navigation is the one
     * that matches what an operator does. The window is 30 s because under full-suite load
     * the settle can outlast 15 s; alone it takes well under one.
     */
    await expect(async () => {
      await page.getByRole("link", { name: "v1", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Version 1" })).toBeVisible({
        timeout: 3_000,
      });
    }).toPass({ timeout: 30_000 });

    await page.getByRole("button", { name: "Restore this version" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Keep as is" })).toBeVisible();
    await dialog.getByRole("button", { name: "Restore version 1" }).click();

    await expect(page.getByText("Version 1 is restored.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `History of Audit Before ${RUN}` }),
    ).toBeVisible();
  });

  test("the audit screens are accessible", async ({ page }) => {
    await page.goto("/audit");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
