import { expect, test } from "@playwright/test";

/**
 * PRD F10: curated information — advisories, seasonal timings, festival calendars — is
 * labelled "Updated [date]", so a traveler can tell a notice written this morning from one
 * written last season. Advisories had a source and a date range but no update date.
 */
test.describe("An advisory says when it was updated (PRD F10)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("on the destination page", async ({ page }) => {
    await page.goto("/en/destinations/fixture-devagiri");

    const advisories = page.getByRole("region", { name: /advisor/i });
    await expect(advisories).toBeVisible();
    // The date comes in the reader's own order — "Sep 22" in English, day first in Hindi —
    // so this asserts the label and that something follows it, not one particular order.
    await expect(advisories.getByText(/^Updated \S/)).toBeVisible();
  });
});
