import { expect, test } from "@playwright/test";

/**
 * Smoke test against a REAL deployment (TRD §11.2 Day 20).
 *
 * Deliberately different from the E2E suite in one respect: it creates nothing and assumes
 * no fixtures. Production has real content and real travelers, and a test that seeds a
 * journey there is a test that leaves rubbish behind — or worse, is written to clean up
 * and one day cleans up something else.
 *
 * So this asks only the questions that have to be true of any healthy deployment: does it
 * answer, is it configured, is the gate holding, and is it the version we just shipped.
 */
test.describe("The deployment answers", () => {
  test("serves the traveler app", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);

    // Locale routing works, which means middleware ran.
    await expect(page).toHaveURL(/\/(en|te|hi)(\/|$)/);
  });

  test("has its security headers", async ({ page }) => {
    const headers = (await page.goto("/en"))!.headers();

    // Config that exists locally and not in production is the classic deploy mistake:
    // nothing errors, the app is simply less safe than everyone believes.
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBeTruthy();
  });

  test("keeps the API alive", async ({ request }) => {
    // The keepalive route the Vercel Cron calls. If this is not 204, the free-tier
    // Supabase project will pause within about a week and the app stops entirely.
    const response = await request.get("/api/heartbeat");
    expect(response.status()).toBe(204);
  });

  test("is installable as a PWA", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.status()).toBe(200);

    const body = await manifest.json();
    expect(body.start_url).toBeTruthy();
    expect(body.icons?.length ?? 0).toBeGreaterThan(0);
  });
});

test.describe("The publish gate holds in production", () => {
  test("a guest can browse without an account", async ({ page }) => {
    // AUTH-03 is guest-first. A deploy that quietly requires sign-in to look at anything
    // has broken the product's opening promise.
    await page.goto("/en");
    await expect(page.getByRole("link", { name: /Plan a journey/i })).toBeVisible();
  });

  test("a signed-out visitor cannot reach a saved journey", async ({ page }) => {
    const response = await page.goto("/en/journeys");

    // Middleware sends them to sign-in rather than showing an empty list.
    expect(response?.url()).toContain("/sign-in");
  });

  test("the API refuses an unauthenticated write", async ({ request }) => {
    const response = await request.post("/api/journeys", {
      data: { destinationId: "00000000-0000-4000-8000-000000000000", startDate: "2027-01-01" },
      failOnStatusCode: false,
    });

    // 401 for no session, or 400 for a brief that fails validation before auth — both mean
    // nothing was written. A 200 here would mean production is accepting anonymous writes.
    expect([400, 401]).toContain(response.status());
  });

  test("nothing unpublished leaks into search", async ({ page }) => {
    await page.goto("/en/search?q=a");

    /*
     * The publish gate is structural — `anon` has no base-table grant — so this passing is
     * expected. It is here because it is the assertion whose failure would matter most:
     * unverified knowledge reaching a traveler is the one thing this product must never do
     * (PRD F1).
     */
    await expect(page.getByText(/draft|unpublished|in_review/i)).toHaveCount(0);
  });
});
