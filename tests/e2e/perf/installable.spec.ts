import { expect, test } from "@playwright/test";

/**
 * The "installable" third of TRD-PERF-001's Lighthouse clause.
 *
 * The clause is "Lighthouse (mobile) ≥ 80 Performance / ≥ 95 Accessibility / installable".
 * Accessibility is already covered by axe on every screen in the ordinary suite, and
 * installability is a set of facts about the manifest and the service worker — both
 * checkable here. The Performance SCORE is the one part that genuinely needs Lighthouse
 * against a deployed build; the metrics behind it are measured in `budgets.spec.ts`.
 *
 * Checked rather than assumed because an installable PWA is not a nicety on iOS: web push
 * and durable storage only become available once the app is on the home screen, and
 * offline reading is a core requirement (PRD F11). A manifest that quietly stops being
 * valid takes both away and nothing else would notice.
 */
test.describe("TRD-PERF-001 — the app is installable", () => {
  test("serves a manifest with everything an install prompt needs", async ({ page }) => {
    await page.goto("/en");

    const href = await page.locator('link[rel="manifest"]').first().getAttribute("href");
    expect(href, "no manifest is linked from the page").toBeTruthy();

    const response = await page.request.get(href!);
    expect(response.ok(), `the manifest answered ${response.status()}`).toBe(true);

    const manifest = await response.json();
    expect(manifest.name, "a manifest needs a name").toBeTruthy();
    expect(manifest.short_name, "a home-screen icon needs a short name").toBeTruthy();
    expect(manifest.start_url, "an installed app needs somewhere to start").toBeTruthy();
    expect(manifest.display, "standalone is what makes it feel installed").toBe("standalone");

    // 192 and 512 are the two Chrome requires before it offers to install at all.
    const sizes = (manifest.icons ?? []).map((icon: { sizes: string }) => icon.sizes);
    expect(sizes, "Chrome will not offer an install without a 192 px icon").toContain("192x192");
    expect(sizes, "nor without a 512 px one").toContain("512x512");

    // A maskable icon is what stops Android cropping the logo into a circle badly.
    const purposes = (manifest.icons ?? []).map((icon: { purpose?: string }) => icon.purpose);
    expect(purposes, "no maskable icon: Android will crop it").toContain("maskable");
  });

  test("every icon the manifest promises actually exists", async ({ page }) => {
    await page.goto("/en");
    const href = await page.locator('link[rel="manifest"]').first().getAttribute("href");
    const manifest = await (await page.request.get(href!)).json();

    for (const icon of manifest.icons ?? []) {
      const response = await page.request.get(icon.src);
      expect(response.ok(), `${icon.src} answered ${response.status()}`).toBe(true);
    }
  });

  test("a service worker controls the page, which is what makes offline possible", async ({
    page,
  }) => {
    await page.goto("/en", { waitUntil: "load" });

    const registered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active || registration?.installing || registration?.waiting);
    });

    expect(registered, "no service worker: no offline, and no install prompt").toBe(true);
  });
});
