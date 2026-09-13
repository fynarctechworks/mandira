import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * O11 Verify queue and O13 Approve & publish, including scheduling (PRD F18).
 *
 * The rules — who may verify, validation at schedule time AND at run time, separation of
 * duties — are asserted in pgTAP. These check the screens offer them honestly.
 */
const RUN = `wf-${Date.now().toString(36)}`;

test.describe("O11 — Verify queue", () => {
  test("keeps its filter in the URL", async ({ page }) => {
    await page.goto("/verify");
    await expect(page.getByRole("heading", { name: "Verify queue" })).toBeVisible();

    await page.getByLabel("Show").selectOption("unclaimed");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/show=unclaimed/);
  });

  test("an empty queue reads as healthy, and a full one opens the field's trust panel", async ({
    page,
  }) => {
    await page.goto("/verify");

    // The queue streams in after the heading, so wait for either state before choosing a branch.
    const check = page.getByRole("button", { name: "Check" }).first();
    const healthy = page.getByText(/healthy state, not an empty one/);
    await expect(check.or(healthy).first()).toBeVisible();
    if (!(await check.isVisible())) {
      await expect(page.getByText(/healthy state, not an empty one/)).toBeVisible();
      return;
    }

    await check.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("group", { name: /^Trust for / })).toBeVisible();
  });

  test("the verify queue is accessible", async ({ page }) => {
    await page.goto("/verify");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});

test.describe.serial("O13 — Approve & publish", () => {
  test("lists a submitted advisory, not only places, experiences and destinations", async ({
    page,
  }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`WF Dest ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-dest`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `WF Dest ${RUN}` })).toBeVisible();

    await page.goto("/advisories/new");
    await page.getByLabel("Destination").selectOption({ label: `WF Dest ${RUN}` });
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`WF Notice ${RUN}`);
    await page.getByRole("button", { name: "Create advisory" }).click();
    await expect(page.getByRole("heading", { name: `WF Notice ${RUN}` })).toBeVisible();

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("region", { name: "Publishing" })).toContainText("in review");

    await page.goto("/publish");
    const item = page
      .getByRole("listitem")
      .filter({ hasText: `WF Notice ${RUN}` })
      .first();
    await expect(item).toBeVisible();
    await expect(item).toContainText("Advisory");
  });

  test("offers a scheduled publish with a date and time, and asks for a day first", async ({
    page,
  }) => {
    await page.goto("/publish");
    const item = page
      .getByRole("listitem")
      .filter({ hasText: `WF Notice ${RUN}` })
      .first();

    const schedule = item.getByRole("button", { name: "Schedule…" });
    if ((await schedule.count()) === 0)
      test.skip(true, "the advisory is still blocked by validation");

    await schedule.click();
    const popover = page.getByRole("dialog");
    await expect(popover.getByRole("grid")).toBeVisible();

    await expect(popover.getByLabel("Time")).toHaveValue("09:00");

    // Tomorrow is chosen by default; choosing it again clears the day.
    await popover.getByRole("gridcell", { selected: true }).getByRole("button").click();
    await popover.getByRole("button", { name: "Schedule", exact: true }).click();
    await expect(popover.getByRole("alert")).toContainText("Choose a day.");
  });

  test("always shows the Scheduled section, with what the job does", async ({ page }) => {
    await page.goto("/publish");
    await expect(page.getByRole("heading", { name: /^Scheduled \(\d+\)$/ })).toBeVisible();
    await expect(page.getByText(/Checked every five minutes/)).toBeVisible();
  });

  test("the publish queue is accessible", async ({ page }) => {
    await page.goto("/publish");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
