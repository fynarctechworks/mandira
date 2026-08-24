import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Scaffold smoke (B-001): the traveler shell renders with tokens and passes axe.
test("traveler shell renders and is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan around what matters");

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});
