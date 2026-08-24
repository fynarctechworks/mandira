import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Known, escalated exception (OPEN-008, raised 2026-08-24, awaiting founder decision).
 *
 * The PROTECTED tier chip is `text.on.primary` #FFFFFF on `brand.primary` #FF660E, which
 * measures 2.93:1 — below the 4.5:1 that PRD 12.1 itself claims for every pair in its tables
 * and that PRD 12.8 / PRD-DSGN-001 require. The token values are normative (PRD 12.1
 * "Exact palette"), so B-001 implements them verbatim rather than silently substituting a
 * compliant colour. Only this pair is tolerated; any other serious/critical violation fails.
 *
 * Remove this allowance once the founder decides (either new light-mode hex values, or a
 * documented AA exception in the PRD).
 */
const KNOWN_LIGHT_MODE_CONTRAST_EXCEPTIONS = ["PROTECTED"];

test("ops shell renders and is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Operations shell");

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes
        .filter(
          (n) =>
            !(
              v.id === "color-contrast" &&
              KNOWN_LIGHT_MODE_CONTRAST_EXCEPTIONS.some((label) => n.html.includes(label))
            ),
        )
        .map((n) => `${v.id}: ${n.html}`),
    );

  expect(serious).toEqual([]);
});
