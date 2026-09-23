import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Prepare and the Journey Summary (B-021, PRD F7, PRD-PREP-001/004, TRD-SEC-004).
 *
 * The share link is the only page in Mandhira a stranger can open, so the assertions that
 * matter most are about what it does NOT contain and about it going dead on command. The
 * privacy projection itself is proven in pgTAP (`0016_share_summary_test.sql`); what is
 * proven here is that the page a person actually opens is the one that projection feeds.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

async function saveJourney(page: Page): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: "2026-10-12",
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      // A wheelchair user, so the "For your travelers" group has a reason to exist —
      // and so the share test has a real mobility need that must never leak.
      travelers: [{ mobility: "wheelchair", ageBand: "senior" }],
    },
  });

  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

test.describe("The Prepare checklist", () => {
  test("is built from what the journey actually contains", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    await expect(page.getByRole("heading", { name: "Prepare", level: 1 })).toBeVisible();

    // The fixture's Dawn Darshan needs booking 60 days ahead, and says how.
    await expect(page.getByRole("heading", { name: "Bookings & tickets" })).toBeVisible();
    await expect(page.getByText(/Book Dawn Darshan \(fixture\) in advance/)).toBeVisible();

    // Derived from the place, not invented.
    await expect(page.getByRole("heading", { name: "Know before you go" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What to carry" })).toBeVisible();

    // Raised only because someone in this group uses a wheelchair.
    await expect(page.getByRole("heading", { name: "For your travelers" })).toBeVisible();
  });

  test("says a booking deadline out loud, with the how-to behind Why?", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    // PRD F7's acceptance: a booking task is DATED and carries instructions.
    await expect(page.getByText(/Book Dawn Darshan \(fixture\) in advance — by /)).toBeVisible();

    const why = page.getByRole("button", { name: /Why\?/ }).first();
    await why.click();

    // Lifted verbatim from knowledge. Never a generated explanation.
    await expect(page.getByText("Invented: book through the fixture portal.")).toBeVisible();
  });

  test("carries a trust badge on a task that came from knowledge (PRD F9)", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    await expect(page.getByRole("button", { name: /where this comes from/ }).first()).toBeVisible();
  });

  test("remembers a tick across a reload", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    const box = page.getByRole("checkbox").first();
    await expect(box).toHaveAttribute("data-state", "unchecked");
    await box.click();
    await expect(box).toHaveAttribute("data-state", "checked");

    await page.reload();
    await expect(page.getByRole("checkbox").first()).toHaveAttribute("data-state", "checked");
  });

  test("keeps a tick when the checklist is rebuilt after a journey edit", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    await page.getByRole("checkbox").first().click();
    await expect(page.getByRole("checkbox").first()).toHaveAttribute("data-state", "checked");

    // Editing the journey regenerates the checklist. The engine's stable ids are what
    // stop that regeneration from quietly unticking everything the traveler has done.
    await page.goto(`/en/journeys/${journeyId}`);
    // The stop's controls fold away so a day can be read (D-212), so open one first.
    await page.locator("summary").filter({ hasText: "Edit this stop" }).first().click();
    await page
      .getByRole("combobox", { name: "Time to leave before this" })
      .first()
      .selectOption("45");

    await expect(page.getByText("45 min to get there")).toBeVisible();
    await page.goto(`/en/journeys/${journeyId}/prepare`);

    await expect(page.getByRole("checkbox").first()).toHaveAttribute("data-state", "checked");
  });

  test("refuses a tick on a task that is not this journey's", async ({ page }) => {
    const journeyId = await saveJourney(page);

    const response = await page.request.patch(`/api/journeys/${journeyId}/prepare`, {
      data: { key: "booking:00000000-0000-4000-8000-000000000000", isDone: true },
    });

    expect(response.status()).toBe(404);
  });
});

test.describe("The Journey Summary", () => {
  test("shows the days, the tiers and what you need to get in", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/summary`);

    await expect(page.getByText("Dawn Darshan (fixture)")).toBeVisible();
    // The shared tier chip, in the traveler's language — not the hard-coded English
    // "PROTECTED" the summary used to print in every language (design review).
    await expect(page.getByText("Must do", { exact: true }).first()).toBeVisible();

    /*
     * Requirements appear once per DAY, not once per item (D-100). Both items are at the
     * same temple, and repeating "carry photo ID" under each one took a busy day onto a
     * second sheet — which breaks the one-A4-per-day criterion. Asserting the COUNT is
     * what keeps that from creeping back.
     */
    await expect(page.getByText(/To get in: Carry photo ID/)).toHaveCount(1);
    await expect(page.getByText(/What to wear: Traditional dress/)).toHaveCount(1);
  });

  test("hides its controls on paper, and breaks a page per day", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/summary`);

    const printControl = page.getByRole("button", { name: /Print or save as PDF/ });
    await expect(printControl).toBeVisible();

    /*
     * Emulating print rather than counting pages. Page count depends on the print
     * renderer, so asserting "one A4 per day" here would go red for reasons that have
     * nothing to do with this code — the manual PDF check is recorded in the plan's §9
     * instead (PREP-01 §5b).
     */
    await page.emulateMedia({ media: "print" });

    await expect(printControl).toBeHidden();

    const breaks = await page
      .locator(".summary-day")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).breakAfter));
    expect(breaks.length).toBeGreaterThan(0);
    // Every day but the last starts a new sheet.
    expect(breaks.slice(0, -1).every((value) => value === "page")).toBe(true);
  });
});

test.describe("Sharing a read-only copy", () => {
  /** Mints a link through the API and returns the public URL path. */
  async function share(page: Page, journeyId: string): Promise<string> {
    const response = await page.request.post(`/api/journeys/${journeyId}/share`);
    expect(response.status()).toBe(200);

    const token = (await response.json()).data.token as string;
    // TRD-SEC-004: 32 bytes, base64url — 43 characters with no padding.
    expect(token).toHaveLength(43);
    return `/en/s/${token}`;
  }

  test("hands the traveler a working link from the screen itself", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);
    await page.goto(`/en/journeys/${journeyId}/summary`);

    await page.getByRole("button", { name: "Share a read-only copy" }).click();

    /*
     * Read the link out of the field the traveler actually copies from, and follow it.
     * Every other test here mints through the API, which is why a hydration mismatch in
     * this input — server rendering a relative URL, client an absolute one — went unseen.
     */
    const field = page.getByRole("textbox", { name: /Anyone with this link/ });
    await expect(field).toBeVisible();

    const link = await field.inputValue();
    expect(link).toMatch(/^https?:\/\/[^/]+\/en\/s\/[\w-]{43}$/);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();
    expect((await stranger.goto(link))?.status()).toBe(200);
    await expect(stranger.getByText("Dawn Darshan (fixture)")).toBeVisible();

    await context.close();
  });

  test("says what stopping sharing will do before it does it", async ({ page }) => {
    const journeyId = await saveJourney(page);
    await share(page, journeyId);
    await page.goto(`/en/journeys/${journeyId}/summary`);

    // PRD Principle 6 again: revoking is irreversible for anyone already holding the
    // link, so it takes a second, informed tap.
    await page.getByRole("button", { name: "Stop sharing" }).click();
    await expect(page.getByText(/stops working for everyone you sent it to/)).toBeVisible();

    await page.getByRole("button", { name: "Yes, stop sharing" }).click();
    await expect(page.getByRole("button", { name: "Share a read-only copy" })).toBeVisible();
  });

  test("opens for someone signed out, and shows the plan", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);
    const url = await share(page, journeyId);

    // A genuinely separate context: inheriting the storage state would test the owner
    // reading their own journey, which is not what a share link is for.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();
    await stranger.goto(url);

    await expect(stranger.getByText("Dawn Darshan (fixture)")).toBeVisible();
    await expect(stranger.getByText(/Shared with you/)).toBeVisible();

    await context.close();
  });

  test("shows nothing about the people travelling", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);
    const url = await share(page, journeyId);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();
    await stranger.goto(url);

    // The journey was saved with a wheelchair user aboard. A link forwarded through a
    // family group must not be how that gets told to everyone.
    const body = await stranger.locator("body").innerText();
    expect(body).not.toMatch(/wheelchair/i);
    expect(body).not.toMatch(/senior/i);

    await context.close();
  });

  test("cannot be changed by whoever holds it", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);
    const url = await share(page, journeyId);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();
    await stranger.goto(url);

    // Read-only means read-only: no tier control, no remove, no tick.
    await expect(stranger.getByRole("checkbox")).toHaveCount(0);
    await expect(stranger.getByRole("button", { name: /Remove/ })).toHaveCount(0);

    // And the API refuses them outright, not just the screen.
    const attempt = await stranger.request.patch(`/api/journeys/${journeyId}/prepare`, {
      data: { key: "downloads:offline", isDone: true },
    });
    expect(attempt.status()).toBe(401);

    await context.close();
  });

  test("stops working the moment it is revoked", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);
    const url = await share(page, journeyId);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    expect((await stranger.goto(url))?.status()).toBe(200);

    const revoked = await page.request.delete(`/api/journeys/${journeyId}/share`);
    expect(revoked.status()).toBe(200);

    // 404, not a message saying it was revoked — telling the holder which it was would
    // confirm a journey existed behind the link.
    expect((await stranger.goto(url))?.status()).toBe(404);

    await context.close();
  });

  test("an invented token is a 404, not a blank page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    const response = await stranger.goto("/en/s/not-a-real-token-at-all");
    expect(response?.status()).toBe(404);

    await context.close();
  });

  test("a stranger cannot mint a link to someone else's journey", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    const response = await stranger.request.post(`/api/journeys/${journeyId}/share`);
    expect(response.status()).toBe(401);

    await context.close();
  });
});

test("Prepare, the summary and a shared link are all accessible", async ({ page, browser }) => {
  const journeyId = await saveJourney(page);

  for (const url of [`/en/journeys/${journeyId}/prepare`, `/en/journeys/${journeyId}/summary`]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results), url).toEqual([]);
  }

  const response = await page.request.post(`/api/journeys/${journeyId}/share`);
  const token = (await response.json()).data.token as string;

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const stranger = await context.newPage();
  await stranger.goto(`/en/s/${token}`);

  const shared = await new AxeBuilder({ page: stranger })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(seriousViolations(shared), "shared summary").toEqual([]);
  await context.close();
});
