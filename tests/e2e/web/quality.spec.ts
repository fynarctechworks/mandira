import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The quality pass (B-024, TRD §11.2 Day 19, TRD §6.1, PRD-DSGN-006).
 *
 * Every feature commit since B-014 has left axe green on its own screens. What this file
 * adds is the conditions nobody browses in by default and everybody eventually browses in:
 * 200 % text, dark mode, and a Content-Security-Policy actually applied.
 */
const SCREENS = ["/en", "/en/plan", "/en/search", "/en/destinations/fixture-devagiri"];

test.describe("Security headers (TRD §6.1)", () => {
  test("are on the response, not just in the config", async ({ page }) => {
    const response = await page.goto("/en");
    const headers = response!.headers();

    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
  });

  test("stop this app being framed, which is how a share link gets clickjacked", async ({
    page,
  }) => {
    const csp = (await page.goto("/en"))!.headers()["content-security-policy"] ?? "";

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // A journey is never posted anywhere but here.
    expect(csp).toContain("form-action 'self'");
  });

  test("do not leak a share token in a Referer", async ({ page }) => {
    // The token IS the credential (TRD-SEC-004). `strict-origin-when-cross-origin` sends
    // only the origin off-site, so a forwarded link cannot hand the token to whatever the
    // traveler taps next.
    const headers = (await page.goto("/en"))!.headers();
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("let every screen still load — a CSP that breaks the app is worse than none", async ({
    page,
  }) => {
    const blocked: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) blocked.push(message.text());
    });

    for (const screen of SCREENS) {
      await page.goto(screen);
      await expect(page.locator("body")).toBeVisible();
    }

    expect(blocked, "CSP blocked something the app needs").toEqual([]);
  });
});

test.describe("Accessibility beyond the default conditions (PRD-DSGN-006)", () => {
  test("stays usable at 200 % text scale", async ({ page }) => {
    /*
     * WCAG 2.2 AA asks for 200 % without loss of content or function. This product is
     * built for pilgrims, a population skewing older, on phones held at arm's length — so
     * this is not a compliance box, it is a substantial share of the actual audience.
     *
     * The controls are declared with MINIMUM heights rather than fixed ones precisely so
     * they grow instead of clipping; this is what checks that held.
     */
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });

    for (const screen of SCREENS) {
      await page.goto(screen);
      await page.addStyleTag({ content: "html { font-size: 32px !important; }" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(seriousViolations(results), `${screen} at 200%`).toEqual([]);

      // Nothing may scroll sideways: a horizontal scrollbar at 200 % means text was
      // pushed off-screen rather than reflowed.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2,
      );
      expect(overflows, `${screen} scrolls sideways at 200%`).toBe(false);
    }
  });

  test("is accessible in dark mode", async ({ page }) => {
    // The dark palette carries its own contrast ratios (D-025), and nothing had ever
    // checked them with content on the page rather than in a token test.
    await page.emulateMedia({ colorScheme: "dark" });

    for (const screen of SCREENS) {
      await page.goto(screen);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      expect(seriousViolations(results), `${screen} in dark mode`).toEqual([]);
    }

    await page.emulateMedia({ colorScheme: "light" });
  });

  test("respects a request for reduced motion", async ({ page }) => {
    // PRD §12.6: every transition becomes instant. Someone with vestibular sensitivity
    // should not have to endure an animation to read their journey.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");

    const duration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--duration-state").trim(),
    );

    // The browser normalises `0ms` to `0s`; both mean the same instant transition.
    expect(["0ms", "0s"]).toContain(duration);
  });
});

test.describe("Analytics (PRD-ANLY-001)", () => {
  test("accepts an allowlisted event from a guest", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/en");

    // Guests included deliberately: most of PRD §7's funnel happens before anyone signs in.
    const response = await page.request.post("/api/analytics", {
      data: { events: [{ name: "destination_viewed", properties: { locale: "en" } }] },
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).data.accepted).toBe(1);

    await context.close();
  });

  test("silently refuses an event that is not on the allowlist", async ({ page }) => {
    const response = await page.request.post("/api/analytics", {
      data: { events: [{ name: "user_email_captured", properties: {} }] },
    });

    // 200 with nothing accepted: the caller has nothing to do about it, and a 4xx would
    // show up as an error rate rather than as the client misconfiguration it is.
    expect(response.status()).toBe(200);
    expect((await response.json()).data.accepted).toBe(0);
  });

  test("refuses free text as a property value", async ({ page }) => {
    // Without this, "search_term" arrives as a property and with it the name of a temple
    // somebody was quietly looking for at 2am.
    const response = await page.request.post("/api/analytics", {
      data: {
        events: [{ name: "search_performed", properties: { locale: "Where is Hill Temple?" } }],
      },
    });

    expect(response.status()).toBe(400);
  });
});
