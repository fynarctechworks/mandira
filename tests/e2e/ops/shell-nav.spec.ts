import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { NAV_ITEMS, availableNavItems } from "../../../apps/ops/lib/nav";
import { seriousViolations } from "../axe-exceptions";

/**
 * The Ops shell (B-008): navigation, command palette, and the authenticated frame.
 * Runs as the seeded admin, since everything here lives behind the role gate.
 */
test.describe("Ops shell", () => {
  // Session comes from the ops-setup project (see playwright.config.ts).
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the operator, their role, and the full screen map", async ({ page }) => {
    await expect(page.getByText("admin@mandhira.local")).toBeVisible();
    await expect(page.getByText("admin", { exact: true })).toBeVisible();

    // Match the section headings by role: a bare text match on "SOURCES" also hits the
    // "Sources registry" item inside that very section.
    const nav = page.getByRole("navigation", { name: "Operations sections" });
    for (const section of ["OVERVIEW", "KNOWLEDGE", "SOURCES", "QUEUES", "ADMINISTRATION"]) {
      await expect(nav.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }

    // Unbuilt screens are shown, not hidden, and say when they arrive. Picked from the
    // model rather than hardcoded, so shipping a screen doesn't break this test.
    const pending = NAV_ITEMS.find((item) => item.href === null)!;
    await expect(nav.getByText(pending.label, { exact: true })).toBeVisible();
    await expect(nav.getByText(pending.comingIn!, { exact: true }).first()).toBeVisible();
  });

  test("exactly the built screens are links; the rest are inert", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Operations sections" });

    // Derived from the nav model: a screen shipping should not require editing this test,
    // but a screen that is marked available while having no link should fail it.
    const built = availableNavItems();
    await expect(nav.getByRole("link")).toHaveCount(built.length);
    for (const item of built) {
      await expect(nav.getByRole("link", { name: item.label, exact: true })).toBeVisible();
    }
  });

  test("the command palette opens with the keyboard and lists screens", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+k");

    const input = page.getByPlaceholder("Go to…");
    await expect(input).toBeVisible();

    /*
     * An UNBUILT screen, deliberately. This test is about the palette being honest when it
     * finds one — and the example has to be replaced whenever the named screen ships.
     * "Conflicts" was it until B-030 built the queue; Advisories is the M4 stand-in now.
     */
    await input.fill("advis");
    // Scope to the dialog: the sidebar lists these screens too, so an unscoped text match
    // would resolve to two elements and fail on strict mode rather than on behaviour.
    const palette = page.getByRole("dialog");
    // Searching for an unbuilt screen finds it and says when it lands, rather than
    // returning nothing as though it did not exist.
    await expect(palette.getByText("Advisories", { exact: true })).toBeVisible();
    await expect(palette.getByText("M4", { exact: true }).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(input).not.toBeVisible();
  });

  test("the authenticated shell is accessible", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousViolations(results)).toEqual([]);
  });
});
