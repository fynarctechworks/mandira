import { expect, test } from "@playwright/test";

/**
 * Welcome & language (PRD A01) and what it costs a first visit (TRD-PERF-001, D-233).
 *
 * The card is decided on the server now. Drawn after scripts ran, it appeared at the top of
 * Home late in the load and pushed the whole page down; and the language names on it pulled
 * 242 kB of Telugu and Devanagari web font into every English first visit.
 */
test.describe("A01 — Welcome & language", () => {
  test("is part of the first paint, not added after scripts run", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en");

    await expect(page.getByRole("heading", { name: "Choose your language" })).toBeVisible();
    await context.close();
  });

  test("is asked once per device", async ({ page }) => {
    await page.goto("/en");
    const card = page.getByRole("region", { name: "Choose your language" });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Continue" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Plan around what matters." })).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test("a device that chose before the cookie existed is not asked again", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("mandhira:language-chosen", "1"));
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Choose your language" })).toHaveCount(0);

    // Carried over to the cookie, so the server leaves the card out from now on.
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "mandhira-language-chosen")?.value).toBe("1");
  });

  test("an English page downloads no Telugu or Devanagari font", async ({ page }) => {
    // With the language tiles AND the switcher's options on screen — the two things that
    // used to pull both faces in.
    await page.goto("/en");
    await expect(page.getByRole("region", { name: "Choose your language" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const indic = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((face) => /Noto Sans (Telugu|Devanagari)/.test(face.family))
        .map((face) => face.status);
    });
    expect(indic.length).toBeGreaterThan(0);
    expect(indic.every((status) => status === "unloaded")).toBe(true);
  });

  test("a Telugu page still draws Telugu in its web font", async ({ page }) => {
    await page.goto("/te");
    await page.waitForLoadState("networkidle");
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(
        (face) => face.family.includes("Noto Sans Telugu") && face.status === "loaded",
      );
    });
    expect(loaded).toBe(true);
  });
});
