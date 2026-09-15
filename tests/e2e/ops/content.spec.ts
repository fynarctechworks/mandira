import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * O19 Advisories · O17 Translations · O08 source detail · O16 media usage (PRD F17, F19, F20).
 */
const RUN = `cnt-${Date.now().toString(36)}`;

test.describe.serial("O19 — Advisories", () => {
  test("creates an advisory that opens with its publishing panel and history", async ({ page }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Adv Dest ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-dest`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `Adv Dest ${RUN}` })).toBeVisible();

    await page.goto("/advisories/new");
    await page.getByLabel("Destination").selectOption({ label: `Adv Dest ${RUN}` });
    await page.getByLabel("Severity").selectOption("caution");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Ghat closed ${RUN}`);
    await page.getByRole("button", { name: "Create advisory" }).click();

    await expect(page.getByRole("heading", { name: `Ghat closed ${RUN}` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Publishing" })).toContainText(
      "Travelers cannot see this yet.",
    );
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();

    await page.goto("/advisories");
    const row = page.getByRole("row").filter({ hasText: `Ghat closed ${RUN}` });
    await expect(row).toContainText("Caution");
  });

  test("refuses a window that ends before it starts", async ({ page }) => {
    await page.goto("/advisories");
    await page.getByRole("link", { name: `Ghat closed ${RUN}` }).click();
    await expect(page.getByRole("heading", { name: `Ghat closed ${RUN}` })).toBeVisible();

    await page.getByLabel("Starts").fill("2026-12-10T10:00");
    await page.getByLabel("Ends").fill("2026-12-01T10:00");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("The end has to be after the start")).toBeVisible();
  });

  test("the advisories screens are accessible", async ({ page }) => {
    for (const path of ["/advisories", "/advisories/new"]) {
      await page.goto(path);
      expect(seriousViolations(await new AxeBuilder({ page }).analyze()), path).toEqual([]);
    }
  });
});

test.describe("O17 — Translations", () => {
  test("shows content coverage per locale and keeps string filters in the URL", async ({
    page,
  }) => {
    await page.goto("/translations");
    await expect(page.getByRole("heading", { name: "Translations", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Content by locale" })).toBeVisible();

    const search = page.getByLabel("Search");
    if ((await search.count()) === 0) {
      await expect(page.getByText("No interface strings are stored yet.")).toBeVisible();
      return;
    }
    await search.fill("nav");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/q=nav/);
  });

  test("translates a destination side by side, and counts only what is confirmed", async ({
    page,
  }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Trans Dest ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-trans`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `Trans Dest ${RUN}` })).toBeVisible();

    const translate = page.getByRole("link", { name: "Translate", exact: true });
    await expect(translate).toHaveAttribute(
      "href",
      /^\/translations\/destinations\/[0-9a-f-]{36}$/,
    );
    await page.goto(`${await translate.getAttribute("href")}?locale=te`);

    await expect(page.getByRole("heading", { name: `Translate Trans Dest ${RUN}` })).toBeVisible();
    const name = page.getByRole("region", { name: "Name", exact: true });
    await expect(name).toContainText(`Trans Dest ${RUN}`);
    await expect(name).toContainText("Missing");
    await expect(page.getByText("0 of 1 fields confirmed in Telugu")).toBeVisible();

    await name.getByLabel("Telugu").fill("యాత్ర గమ్యం");
    await name.getByRole("button", { name: "Confirm Name" }).click();
    await expect(name).toContainText("Confirmed");
    await expect(page.getByText("1 of 1 fields confirmed in Telugu")).toBeVisible();

    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });

  test("the translation workspace is accessible", async ({ page }) => {
    await page.goto("/translations");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});

test.describe("O08 — Source detail", () => {
  test("shows captures and change candidates, and no longer claims collection is manual", async ({
    page,
  }) => {
    await page.goto("/sources/new");
    await page.getByLabel("Name").fill(`Detail Source ${RUN}`);
    await page.getByRole("button", { name: "Register source" }).click();
    await expect(page).toHaveURL(/\/sources$/);

    // The sources list grows with every local run and can drop a first click while it
    // hydrates; retry until the source is open (the guard knowledge and trust specs use).
    await expect(async () => {
      await page.getByRole("link", { name: `Detail Source ${RUN}` }).click();
      await expect(page.getByRole("heading", { name: /^Captures \(\d+\)$/ })).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 25_000 });
    await expect(page.getByRole("heading", { name: /^Change candidates \(\d+\)$/ })).toBeVisible();
    await expect(page.getByText(/Collection is manual for now/)).toHaveCount(0);
  });
});

test.describe("O16 — Media usage", () => {
  test("says where each asset is used", async ({ page }) => {
    await page.goto("/media");
    await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible();

    const items = page.getByRole("heading", { name: /^Library \(\d+\)$/ });
    await expect(items).toBeVisible();
    if ((await page.getByRole("button", { name: "Archive" }).count()) === 0) {
      test.skip(true, "no media uploaded in this database");
    }
    await expect(
      page
        .getByText("Not used anywhere yet")
        .or(page.getByRole("list", { name: "Used in" }))
        .first(),
    ).toBeVisible();
  });
});
