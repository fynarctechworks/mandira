import { expect, test } from "@playwright/test";

/**
 * PRD §5 A06: the Experience screen carries an "availability calendar". It used to carry
 * one line, which answers "when does this run" for something daily and says nothing about
 * whether it runs on the day a pilgrim will actually be there.
 */
test.describe("An experience shows its next two weeks (PRD §5 A06)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("lists fourteen days, each saying in words whether it runs", async ({ page }) => {
    await page.goto("/en/destinations/fixture-devagiri/experiences/fixture-dawn-darshan");

    const calendar = page.locator("details").filter({ hasText: "The next two weeks" });
    await expect(calendar).toBeVisible();

    // Opened by a tap if it started folded — either way the fortnight is one tap away.
    if (!(await calendar.getAttribute("open"))) {
      await calendar.locator("summary").click();
    }

    const rows = calendar.getByRole("listitem");
    await expect(rows).toHaveCount(14);
    // Status is never colour alone (PRD §12.8): every row carries a date and words.
    for (const row of await rows.all()) {
      await expect(row.locator("time")).toHaveCount(1);
      await expect(row).not.toHaveText(/^\s*$/);
    }
  });
});
