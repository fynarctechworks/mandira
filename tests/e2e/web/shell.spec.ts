import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

// Scaffold smoke (B-001/B-002): the traveler shell renders with tokens and passes axe.
test("traveler shell renders and is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan around what matters");

  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(results)).toEqual([]);
});
