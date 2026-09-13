import { expect, test } from "@playwright/test";

/**
 * Saved places (PRD F13, A22).
 *
 * Saved from the place page, listed on Profile, removed again from the place page. The route
 * refusals are asserted directly: a bookmark is the traveler's own row, and nothing about the
 * button is what protects it.
 */
const TEMPLE = "/en/destinations/fixture-devagiri/places/fixture-hill-temple";

test.describe("A guest", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is offered sign-in with the way back to the place", async ({ page }) => {
    await page.goto(TEMPLE);

    await expect(page.getByRole("link", { name: "Sign in to save this place" })).toHaveAttribute(
      "href",
      `/en/sign-in?next=${encodeURIComponent(TEMPLE)}`,
    );
  });

  test("cannot save through the route", async ({ page }) => {
    const response = await page.request.post("/api/saved-places", {
      data: { placeId: "d0000000-0000-4000-8000-00000000f002" },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("A signed-in traveler", () => {
  test("saves a place, finds it on Profile, and removes it", async ({ page }) => {
    await page.goto(TEMPLE);

    const save = page.getByRole("button", { name: "Save this place" });
    const saved = page.getByRole("button", { name: /^Saved/ });

    // A previous run may have left it saved; start from unsaved either way.
    if (await saved.isVisible()) {
      await saved.click();
      await expect(save).toBeVisible();
    }

    await save.click();
    await expect(saved).toBeVisible();

    await page.goto("/en/profile");
    const list = page.getByRole("region", { name: "Saved places" });
    await expect(list.getByRole("link", { name: /Hill Temple \(fixture\)/ })).toHaveAttribute(
      "href",
      TEMPLE,
    );

    await page.goto(TEMPLE);
    await page.getByRole("button", { name: /^Saved/ }).click();
    await expect(page.getByRole("button", { name: "Save this place" })).toBeVisible();

    await page.goto("/en/profile");
    await expect(
      page.getByRole("region", { name: "Saved places" }).getByRole("link", {
        name: /Hill Temple \(fixture\)/,
      }),
    ).toHaveCount(0);
  });

  test("refuses something that is not a place, and a place that is not published", async ({
    page,
  }) => {
    expect(
      (await page.request.post("/api/saved-places", { data: { placeId: "hill-temple" } })).status(),
    ).toBe(400);

    // The fixture's unready shrine exists and is not published.
    expect(
      (
        await page.request.post("/api/saved-places", {
          data: { placeId: "d0000000-0000-4000-8000-00000000f005" },
        })
      ).status(),
    ).toBe(404);
  });
});
