import { expect, test } from "@playwright/test";

/*
 * A07/A08 (PRD F3).
 *
 * The e2e stack may run with or without a model key, so what is asserted is the contract that
 * holds either way: the questions screen offers the describe path, and the describe screen
 * always leads somewhere that works — a text box, or, when descriptions cannot be read, the
 * questions themselves rather than an error (TRD §5.5).
 */
test.describe("describe your journey", () => {
  test("is offered from the questions and never dead-ends", async ({ page }) => {
    await page.goto("/en/plan");
    await page.getByRole("link", { name: "Or describe it in your own words" }).click();

    await expect(page).toHaveURL(/\/en\/plan\/describe$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Describe your journey" }),
    ).toBeVisible();

    const input = page.getByLabel("Your journey, in your own words");
    const fallback = page.getByRole("link", { name: "Answer a few questions", exact: true });
    await expect(input.or(fallback)).toBeVisible();

    if (await fallback.isVisible()) {
      await fallback.click();
      await expect(page).toHaveURL(/\/en\/plan$/);
      return;
    }

    // With a model configured, a description too short to read is caught before any call.
    await input.fill("hi");
    await page.getByRole("button", { name: "Read my description" }).click();
    await expect(page.getByRole("alert")).toContainText("Write a little more");
    await expect(
      page.getByRole("link", { name: "Prefer to answer a few questions?" }),
    ).toBeVisible();
  });
});
