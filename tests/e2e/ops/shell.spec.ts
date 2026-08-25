import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Accessibility of the Ops app's only public page.
 *
 * The Ops shell itself now sits behind the role gate (B-007), so its axe check lives in
 * auth-gate.spec.ts where a real session exists.
 */
test("ops sign-in page renders and is accessible", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in");

  const results = await new AxeBuilder({ page }).analyze();
  expect(seriousViolations(results)).toEqual([]);
});
