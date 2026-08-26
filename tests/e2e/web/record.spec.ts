import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The Journey Record — complete and reflect (B-036, PRD F16, CMPL-01..04).
 *
 * Most of this file is about what the screen must NOT contain. PRD F16 asks for "protected
 * experiences completed — plain statement, no score", and the failure mode here is not a
 * crash: it is a percentage that reads as a grade on somebody's pilgrimage. A traveler who
 * missed the evening aarti because their mother needed to sit down has not scored 71%.
 *
 * So the assertions are negative on purpose, and they run against the RENDERED page rather
 * than the projection, because a ratio can appear in the markup without ever appearing in
 * `lib/record.ts` — "3/5" is two correct numbers and one wrong glyph.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

/** A journey already behind the traveler, which is when the Record is the point. */
function daysAgo(offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() - offsetDays * 86_400_000),
  );
}

function nextWeek(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + 7 * 86_400_000),
  );
}

async function saveJourney(page: Page, startDate: string): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate,
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "limited_walking", ageBand: "senior" }],
    },
  });

  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

/**
 * One finished journey per worker, shared by every test that only READS the Record.
 *
 * `journeys_write` is 120 per hour per user (TRD §6.2) and the whole traveler suite runs
 * as one account, so a file that mints a journey per test spends the budget the rest of
 * the suite needs — it went red with 429s the first time this file ran alongside the
 * others. The limit is right and stays untouched; what changes is that a read-only test
 * stops paying for a write it never needed. The two tests that mutate still get a journey
 * of their own, because sharing one would make them order-dependent.
 */
let sharedPast: string | undefined;

async function pastJourney(page: Page): Promise<string> {
  sharedPast ??= await saveJourney(page, daysAgo(7));
  return sharedPast;
}

async function itemsOf(page: Page, journeyId: string): Promise<{ id: string; tier: string }[]> {
  await page.goto(`/en/journeys/${journeyId}`);

  const anyItemId = await page
    .locator('[id^="tier-"]')
    .first()
    .evaluate((node) => node.id.replace("tier-", ""));

  // An `annotate` that changes nothing and hands back the whole list (PRD-PLAN-002).
  const response = await page.request.patch(`/api/journeys/${journeyId}/items/${anyItemId}`, {
    data: { note: null },
  });
  expect(response.status()).toBe(200);

  return (await response.json()).data.items;
}

/** Marks one item done through the same route the Done tap uses. */
async function markDone(page: Page, journeyId: string, itemId: string) {
  const response = await page.request.patch(
    `/api/journeys/${journeyId}/items/${itemId}/status`,
    { data: { action: "done" } },
  );
  expect(response.status()).toBe(200);
}

test.describe("What the Record says", () => {
  test("is built from Done taps, not from time having passed", async ({ page }) => {
    // PRD-CMPL-001. Every item's date is a week behind, and none of them was tapped.
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}/record`);

    await expect(page.getByRole("heading", { name: "Your journey is complete" })).toBeVisible();

    /*
     * The whole journey is in the past and nothing is marked done. If the projection were
     * inferring completion from the clock, this sentence would be the opposite one.
     */
    await expect(
      page.getByText("The things you said mattered most are still ahead of you."),
    ).toBeVisible();
    await expect(page.getByText("Not marked done").first()).toBeVisible();
  });

  test("counts an item once the traveler taps Done", async ({ page }) => {
    // Its own journey: this one marks items done, and the shared one is read by tests that
    // depend on nothing having been tapped.
    const journeyId = await saveJourney(page, daysAgo(7));
    const items = await itemsOf(page, journeyId);

    for (const item of items.filter((i) => i.tier === "protected" || i.tier === "fixed")) {
      await markDone(page, journeyId, item.id);
    }

    await page.goto(`/en/journeys/${journeyId}/record`);
    await expect(page.getByText("You did everything you said mattered most.")).toBeVisible();
  });

  test("never shows a score, a percentage or a ratio (PRD F16)", async ({ page }) => {
    const journeyId = await saveJourney(page, daysAgo(7));
    const items = await itemsOf(page, journeyId);

    // One done, the rest not — the state most likely to tempt a "1/4" somewhere.
    await markDone(page, journeyId, items[0]!.id);

    await page.goto(`/en/journeys/${journeyId}/record`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const body = (await page.locator("main").innerText()).replace(/\s+/g, " ");

    // No percentage, anywhere.
    expect(body).not.toMatch(/\d+\s*%/);
    // No bare ratio — "3 of 5" reads as a sentence, "3/5" reads as a mark out of five.
    expect(body).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
    // And none of the vocabulary of grading.
    expect(body).not.toMatch(/\b(score|scored|rating|streak|points|badge)\b/i);
  });

  test("shows an item that did not happen without marking it a failure", async ({ page }) => {
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}/record`);

    const row = page.locator("li", { hasText: "Not marked done" }).first();
    await expect(row).toBeVisible();

    /*
     * PRD §12.7's vocabulary rule, applied to the one screen where it is easiest to
     * forget: a thing that did not happen is a fact, not an error.
     */
    await expect(row).not.toContainText(/missed|failed|incomplete|skipped/i);

    // And nothing on the row is painted in the broken palette.
    const markup = await row.evaluate((node) => node.outerHTML);
    expect(markup).not.toMatch(/status-broken/);
  });
});

test.describe("Reflection (PRD-CMPL-002)", () => {
  test("is optional, private, and saved only when the traveler taps Save", async ({ page }) => {
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}/record`);

    // The privacy claim is on the screen, because a text box after a pilgrimage reads as a
    // review form unless somebody says otherwise.
    await expect(page.getByText(/Only you can see these/)).toBeVisible();

    await page.getByLabel("What was most meaningful?").fill("The walk up at dawn.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved, just for you.")).toBeVisible();

    // It survives a reload, which is the only proof that "save" meant anything.
    await page.reload();
    await expect(page.getByLabel("What was most meaningful?")).toHaveValue("The walk up at dawn.");
  });

  test("offers a report rather than filing one", async ({ page }) => {
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}/record`);

    // Nothing offered while there is nothing to report.
    await expect(page.getByText(/report it on the place itself/)).toBeHidden();

    await page.getByLabel("Anything we got wrong?").fill("The closing time was wrong.");
    await expect(page.getByText(/report it on the place itself/)).toBeVisible();

    /*
     * PRD F16 says the last question OFFERS to create a report. Offered — saving the
     * reflection must not file one. Someone writing privately about what went wrong has
     * not asked us to open a ticket in their name.
     */
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved, just for you.")).toBeVisible();
  });
});

test.describe("Completing and planning again", () => {
  test("a journey completes on a tap, never because a date passed", async ({ page }) => {
    // PRD Principle 6 applied to the end of a journey (TRD §5 POST .../complete).
    // Its own journey, because completing one is not something to undo between tests.
    const journeyId = await saveJourney(page, daysAgo(7));
    await page.goto(`/en/journeys/${journeyId}/record`);

    const complete = page.getByRole("button", { name: "Mark this journey complete" });
    await expect(complete).toBeVisible();

    await complete.click();
    await expect(complete).toBeHidden();
  });

  test("does not offer to complete a journey still ahead of the traveler", async ({ page }) => {
    const journeyId = await saveJourney(page, nextWeek());
    await page.goto(`/en/journeys/${journeyId}/record`);

    await expect(page.getByRole("heading", { name: "How it's going" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark this journey complete" })).toBeHidden();
  });

  test("Plan a similar journey re-opens the brief and saves nothing", async ({ page }) => {
    const journeyId = await pastJourney(page);

    await page.goto(`/en/journeys/${journeyId}/record`);
    await page.getByRole("button", { name: "Plan a similar journey" }).click();

    await expect(page).toHaveURL(/\/plan\?/);

    // And it carries the TIERS forward, not the completions — must-do stays must-do.
    const url = new URL(page.url());
    expect(url.searchParams.getAll("must").length).toBeGreaterThan(0);
    // The most constrained mobility in the group, as the original brief collected it.
    expect(url.searchParams.get("mobility")).toBe("limited_walking");
    // Dates are deliberately absent: the one thing the traveler certainly has a view on.
    expect(url.searchParams.get("start")).toBeNull();

    /*
     * PRD-CMPL-003 with Principle 6 on top: a similar journey is a DIFFERENT journey, with
     * different dates and possibly different people. One tap must not have created it — the
     * brief still has to be answered, and the date field is still empty. Counting rows
     * would have been the obvious assertion and the wrong one: the suite runs three workers
     * against one account, so the count moves underneath a test that is not about counting.
     */
    await expect(page.getByLabel("Starting on")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Build my journey" })).toBeVisible();

    // What the traveler said mattered comes back already ticked, so the brief they are
    // answering is the one they gave last time rather than a blank form.
    await expect(page.locator('input[name="must"]:checked')).toHaveCount(1);
    expect(page.url()).not.toContain(journeyId);
  });

  test("the Record is reachable from the journey", async ({ page }) => {
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}`);

    await page.getByRole("link", { name: "Record" }).click();
    await expect(page).toHaveURL(new RegExp(`/journeys/${journeyId}/record$`));
  });

  test("Share summary stays the only share surface (PRD-CMPL-004)", async ({ page }) => {
    const journeyId = await pastJourney(page);
    await page.goto(`/en/journeys/${journeyId}/record`);

    /*
     * The Record holds Done times, private notes and a reflection. None of that belongs on
     * a link somebody can forward, so the Record has no share control of its own — the
     * summary (B-023) remains the single, curated surface that leaves the app.
     */
    await expect(page.getByRole("button", { name: /share/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /share/i })).toHaveCount(0);
    await expect(page.getByText(/Copy link/i)).toHaveCount(0);
  });
});

test("the Record meets WCAG 2.2 AA", async ({ page }) => {
  const journeyId = await pastJourney(page);
  await page.goto(`/en/journeys/${journeyId}/record`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(seriousViolations(results)).toEqual([]);
});
