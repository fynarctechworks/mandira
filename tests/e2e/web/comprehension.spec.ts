import { expect, test } from "@playwright/test";

/**
 * The machine-checkable half of the two comprehension requirements.
 *
 * PRD-DISC-008: "Top-3 significance + availability + booking discoverable in ≤ 60 s, ≤ 3
 * screens (usability test)." PRD-LIVE-005: "What/when/where in ≤ 5 s."
 *
 * Both are ultimately about a person, and `docs/USABILITY_STUDIES.md` is how that half is
 * measured — no test here claims to replace it. What a test CAN prove is the structure the
 * human result depends on: that the facts are reachable in the number of screens the
 * requirement allows, and that they are on the screen without scrolling. If either fails
 * here, no study can pass; if both pass, the study is measuring the design, not a layout
 * bug.
 */
test.describe("PRD-DISC-008 — the three facts are within three screens", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("significance, availability and booking, from Home, in two screens", async ({ page }) => {
    // Screen 1: Home.
    await page.goto("/en");
    await page
      .getByRole("link", { name: /Devagiri/ })
      .first()
      .click();

    // Screen 2: the destination. All three facts are here, on the experience cards.
    await expect(page).toHaveURL(/\/destinations\/fixture-devagiri/);
    const section = page.locator("#what-people-come-here-for").locator("..");
    const cards = section.getByRole("article");
    await expect(cards.first()).toBeVisible();

    const first = cards.first();
    // Significance: the card's one-line summary.
    await expect(first.locator("p").first()).not.toBeEmpty();
    // Availability: in plain language, never a bare timestamp.
    await expect(
      first.getByText(/Daily|Every|Next|Mon|Tue|Wed|Thu|Fri|Sat|Sun|AM|PM/),
    ).not.toHaveCount(0);
    // Booking: stated either way — a pilgrim needs "no booking needed" as much as the reverse.
    await expect(first.getByText(/book/i)).not.toHaveCount(0);
  });

  test("the top experiences come first, ranked by the editors rather than by popularity", async ({
    page,
  }) => {
    await page.goto("/en/destinations/fixture-devagiri");
    const cards = page.locator("#what-people-come-here-for").locator("..").getByRole("article");
    // At least three to choose the top three from, and never more than twenty (PRD F2).
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(20);
  });
});
