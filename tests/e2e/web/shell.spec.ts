import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Traveler shell and PWA (B-014).
 *
 * Guest-first: none of this requires an account (AUTH-03), so every test here runs
 * anonymously — which is also the state a first-time visitor arrives in.
 */
test.describe("Traveler shell", () => {
  test("redirects to a locale-prefixed URL", async ({ page }) => {
    await page.goto("/");
    // Every URL carries its locale, so a shared link means the same thing to whoever
    // opens it.
    await expect(page).toHaveURL(/\/en$/);
  });

  test("renders the home shell with the bottom navigation", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan around what matters");

    const nav = page.getByRole("navigation", { name: "Main" });
    for (const label of ["Home", "Journey", "Prepare", "Profile"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    // Icon AND label, never icon alone (PRD §12.8).
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  test("serves a valid installable manifest", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      display: string;
      theme_color: string;
      start_url: string;
      icons: { sizes: string; purpose?: string }[];
    };

    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#FF660E");
    expect(manifest.start_url).toBe("/en");
    // A maskable icon is what stops Android drawing the icon inside a white circle.
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
  });

  test("ships a service worker that does not take over unprompted", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.ok()).toBe(true);

    const source = await response.text();
    // TRD-DEPL-002: never force a reload. The worker waits for the update toast.
    expect(source).toContain("SKIP_WAITING");
  });

  test("falls back to English for an untranslated locale rather than showing keys", async ({
    page,
  }) => {
    // te/hi are scaffolds until M4. A traveler must see English, not `home.title`.
    await page.goto("/te");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan around what matters");
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
  });

  test("rejects a locale the app does not run", async ({ page }) => {
    const response = await page.goto("/fr");
    expect(response?.status()).toBe(404);
  });

  test("the traveler shell is accessible", async ({ page }) => {
    await page.goto("/en");
    expect(seriousViolations(await new AxeBuilder({ page }).analyze())).toEqual([]);
  });
});
