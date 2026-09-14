import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Place and experience detail, and the trust sheet (B-015 second slice, PRD F2 / F9).
 *
 * The detail page is where the card's single weakest badge (D-083) is broken back down
 * per field. If that breakdown is wrong, a traveler is told to be careful about the wrong
 * thing — which is worse than being told nothing, because they will spend their caution
 * in the wrong place.
 */
const DESTINATION = "/en/destinations/fixture-devagiri";
const TEMPLE = `${DESTINATION}/places/fixture-hill-temple`;
const HALL = `${DESTINATION}/places/fixture-prasadam-hall`;
const DAWN = `${DESTINATION}/experiences/fixture-dawn-darshan`;

test.describe("Place detail", () => {
  test("is reachable from the destination page", async ({ page }) => {
    await page.goto(DESTINATION);
    await page.getByRole("link", { name: /Hill Temple \(fixture\)/ }).click();

    await expect(page).toHaveURL(new RegExp("/places/fixture-hill-temple$"));
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hill Temple (fixture)");
  });

  test("names every day of the week, including the closed ones", async ({ page }) => {
    await page.goto(TEMPLE);

    const hours = page.getByRole("region", { name: "Opening hours" });
    // A list that silently skips a day reads as an oversight rather than as an answer.
    for (const day of ["Monday", "Saturday", "Sunday"]) {
      await expect(hours.getByText(day, { exact: true })).toBeVisible();
    }
    await expect(hours).toContainText("4:30 AM–10:00 PM");
  });

  test("gives each critical field its own badge, not one for the page", async ({ page }) => {
    await page.goto(TEMPLE);

    // This is the whole point of the detail page: which field is the weak one.
    const badges = page.getByRole("button", { name: /where this comes from/ });
    await expect(badges).not.toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Entry requirements — where this comes from/ }),
    ).toBeVisible();
  });

  test("says in full when accessibility has never been recorded", async ({ page }) => {
    await page.goto(HALL);

    // The page someone opened to find out whether they can get in owes them a sentence.
    await expect(page.getByText(/don't have accessibility information/)).toBeVisible();
  });

  test("shows how long to allow, not just the usual case", async ({ page }) => {
    await page.goto(TEMPLE);

    // The max is what a traveler plans around when a queue is unpredictable.
    await expect(page.getByText("Usually 1 h 30 m — allow up to 3 h")).toBeVisible();
  });
});

test.describe("Experience detail", () => {
  test("puts the booking requirement above the description", async ({ page }) => {
    await page.goto(DAWN);

    const booking = page.getByRole("heading", {
      name: /Advance booking required — opens 60 days before/,
    });
    await expect(booking).toBeVisible();

    // Above, deliberately: the one that needs sixty days' notice is not something to find
    // below three paragraphs of significance (PRD F2's sixty-second criterion).
    const bookingBox = await booking.boundingBox();
    const aboutBox = await page.getByRole("heading", { name: "About this" }).boundingBox();
    expect(bookingBox!.y).toBeLessThan(aboutBox!.y);
  });

  test("links to the place it happens at", async ({ page }) => {
    await page.goto(DAWN);
    await page.getByRole("link", { name: /Hill Temple \(fixture\)/ }).click();

    await expect(page).toHaveURL(new RegExp("/places/fixture-hill-temple$"));
  });

  test("marks inherited accessibility as belonging to the place", async ({ page }) => {
    await page.goto(DAWN);

    // A ramp at the temple is not a promise about the queue inside it.
    await expect(page.getByText("Recorded for Hill Temple (fixture).")).toBeVisible();
  });
});

test.describe("The trust sheet", () => {
  test("opens in one tap and names its source", async ({ page }) => {
    await page.goto(TEMPLE);

    // PRD F9's acceptance criterion is literally one tap from any badge.
    await page.getByRole("button", { name: /Opening hours — where this comes from/ }).click();

    // By role: the sheet titles itself in both a heading and an sr-only description, so
    // a bare text lookup is ambiguous.
    await expect(page.getByRole("heading", { name: "Where this comes from" })).toBeVisible();
    await expect(page.getByText(/Fixture Temple Authority/)).toBeVisible();
    await expect(page.getByText("Last confirmed")).toBeVisible();
  });

  test("says when two sources disagree, rather than reassuring", async ({ page }) => {
    await page.goto(DAWN);

    // Dawn Darshan's booking instructions carry a conflict flag.
    await page.getByRole("button", { name: /Booking — where this comes from/ }).click();
    await expect(page.getByText(/Two sources list different information/)).toBeVisible();
  });

  test("closes again", async ({ page }) => {
    await page.goto(TEMPLE);

    const title = page.getByRole("heading", { name: "Where this comes from" });

    await page.getByRole("button", { name: /Opening hours — where this comes from/ }).click();
    await expect(title).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(title).toBeHidden();
  });
});

test.describe("Open in Maps (MAPS-03)", () => {
  test("hands the place off to the traveler's own maps app, by name", async ({ page }) => {
    await page.goto(TEMPLE);

    const link = page.getByRole("link", { name: /Open in Maps/ });
    await expect(link).toBeVisible();

    /*
     * The device emulation reports an Android user agent, so this should be a `geo:` URI
     * rather than a Google Maps URL — someone who installed OsmAnd for offline pilgrimage
     * routes should not be pulled into a different app by us.
     *
     * The coordinates are asserted in full because the failure mode is silent: PostGIS
     * ST_X is longitude and ST_Y is latitude, and a swap renders a confident pin in
     * western China that looks perfectly normal on a map.
     */
    // The platform is read after hydration (open-in-maps.tsx), so the href is waited for
    // rather than read once: a first read can land before the component knows it is Android.
    await expect(link).toHaveAttribute("href", /^geo:17\.386,78\.478\?q=17\.386,78\.478\(/);
    await expect(link).toHaveAttribute("href", /Hill%20Temple/);
  });

  test("says that it leaves the app, for anyone not looking at the icon", async ({ page }) => {
    await page.goto(TEMPLE);

    const link = page.getByRole("link", { name: /Open in Maps/ });
    await expect(link).toHaveAttribute("target", "_blank");
    // WCAG 2.2 AA: a link that leaves the app says so in its accessible name.
    await expect(link).toHaveAccessibleName(/opens Hill Temple \(fixture\) in your maps app/);
  });
});

test("a place in another destination is a 404, not someone else's page", async ({ page }) => {
  // A URL that lies about where something is will be shared, and then quoted.
  const response = await page.goto("/en/destinations/not-real/places/fixture-hill-temple");
  expect(response?.status()).toBe(404);
});

test("the detail pages are accessible", async ({ page }) => {
  for (const url of [TEMPLE, DAWN]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results), url).toEqual([]);
  }
});
