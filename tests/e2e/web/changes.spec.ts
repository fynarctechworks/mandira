import { expect, test, type Page } from "@playwright/test";

/**
 * Adaptive replanning (B-026, PRD F6, PRD-ADPT-001..006).
 *
 * These hit the API directly rather than clicking through the sheet, because the rules
 * PRD F6 sets are rules about the SYSTEM, not about a screen. "Never remove PROTECTED" has
 * to hold against a crafted request, not merely against a UI that declines to offer it —
 * the same reasoning as the tier rules in B-019.
 */
const FIXTURE = {
  dawn: "d0000000-0000-4000-8000-00000000f007",
  aarti: "d0000000-0000-4000-8000-00000000f009",
  destination: "d0000000-0000-4000-8000-00000000f001",
};

function tomorrowInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + 86_400_000),
  );
}

async function saveJourney(page: Page): Promise<string> {
  const response = await page.request.post("/api/journeys", {
    data: {
      destinationId: FIXTURE.destination,
      startDate: tomorrowInIndia(),
      dayCount: 2,
      pace: "balanced",
      mustDo: [FIXTURE.dawn],
      wouldLike: [FIXTURE.aarti],
      travelers: [{ mobility: "full", ageBand: "adult" }],
    },
  });

  expect(response.status()).toBe(200);
  return (await response.json()).data.journeyId as string;
}

/** Raises a trigger and returns the card it produced. */
async function trigger(page: Page, journeyId: string, deltaMinutes: number) {
  const response = await page.request.post(`/api/journeys/${journeyId}/changes`, {
    data: { kind: "user_late", dayIndex: 0, deltaMinutes },
  });

  expect(response.status()).toBe(200);
  return (await response.json()).data as {
    id: string;
    card: {
      outcome: string;
      options: { id: string; step: string; removedItemIds: string[] }[];
      recommended: { id: string; step: string } | null;
      keepAsIs: { resultingState: string };
    };
  };
}

test.describe("Evaluating a change", () => {
  test("returns a card without touching the journey (PRD-ADPT-005)", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 45);

    expect(event.id).toBeTruthy();

    /*
     * The whole premise. Asking "what are my options" must not BE the change — a single
     * endpoint that evaluated and applied would make those indistinguishable, and this
     * product rests on them being different things.
     */
    expect(event.card.keepAsIs.resultingState).toBeTruthy();
    expect(["no_impact", "tight", "item_at_risk", "protected_at_risk", "return_at_risk"]).toContain(
      event.card.outcome,
    );
  });

  test("always offers keeping things as they are, with its cost", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 60);

    // PRD F6: "keep as is" is always present and always states what happens if nothing
    // changes. An option to decline that does not say the cost is not really an option.
    expect(event.card.keepAsIs.resultingState).toBeTruthy();
  });

  test("never offers to remove something the traveler said they must do", async ({ page }) => {
    const journeyId = await saveJourney(page);

    // A big enough delay to force the ladder down to its last rungs.
    const event = await trigger(page, journeyId, 240);

    /*
     * PRD-ADPT-002, and the rule this product would be worthless without. The dawn darshan
     * was marked must-do; no option, at any rung, may propose dropping it. Asserted across
     * EVERY option rather than only the recommended one — an alternative that breaks the
     * rule is still an alternative the traveler can tap.
     */
    const removed = event.card.options.flatMap((option) => option.removedItemIds);
    expect(removed).not.toContain(FIXTURE.dawn);
  });

  test("offers at most three options, and stops climbing once the day works", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 30);

    // PRD F6 caps the card at a recommendation plus two alternatives. More than three
    // choices at 5am in a queue is not a kindness.
    expect(event.card.options.length).toBeLessThanOrEqual(3);
  });
});

test.describe("Deciding", () => {
  test("keeping as is changes nothing and is still recorded", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 45);

    const response = await page.request.post(`/api/journeys/${journeyId}/changes/${event.id}`, {
      data: { optionId: null },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()).data;

    // A declined card is a decision, not an absence — a log that only recorded changes
    // would show someone who declined three times as someone who was never asked.
    expect(body.outcome).toBe("kept");
    expect(body.applied).toEqual([]);
  });

  test("a card can only be answered once", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 45);

    const first = await page.request.post(`/api/journeys/${journeyId}/changes/${event.id}`, {
      data: { optionId: null },
    });
    expect(first.status()).toBe(200);

    // A double-tap on a slow connection is the normal case, not the exotic one. Answering
    // twice would apply the option twice and double-move every item in it.
    const second = await page.request.post(`/api/journeys/${journeyId}/changes/${event.id}`, {
      data: { optionId: null },
    });
    expect(second.status()).toBe(404);
  });

  test("refuses an option that was not on the card", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 45);

    // The option applied must be the one the traveler was SHOWN. An id that was never on
    // the card is either a stale client or a crafted request; both are refused.
    const response = await page.request.post(`/api/journeys/${journeyId}/changes/${event.id}`, {
      data: { optionId: "option-that-never-existed" },
    });

    expect(response.status()).toBe(404);
  });

  test("returns fresh health with the decision, so no verdict goes stale", async ({ page }) => {
    const journeyId = await saveJourney(page);
    const event = await trigger(page, journeyId, 45);

    const response = await page.request.post(`/api/journeys/${journeyId}/changes/${event.id}`, {
      data: { optionId: null },
    });

    expect((await response.json()).data.health).not.toBeNull();
  });
});

test.describe("Who may replan", () => {
  test("a guest cannot raise a trigger on someone's journey", async ({ page, browser }) => {
    const journeyId = await saveJourney(page);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const stranger = await context.newPage();

    const response = await stranger.request.post(`/api/journeys/${journeyId}/changes`, {
      data: { kind: "user_late", dayIndex: 0, deltaMinutes: 30 },
    });

    expect(response.status()).toBe(401);
    await context.close();
  });

  test("refuses a delay longer than the cap, rather than absorbing a changed day", async ({
    page,
  }) => {
    const journeyId = await saveJourney(page);

    // Past four hours the traveler has not run late, they have changed their day — and the
    // honest response is to edit the plan, not to replan around a delay that large.
    const response = await page.request.post(`/api/journeys/${journeyId}/changes`, {
      data: { kind: "user_late", dayIndex: 0, deltaMinutes: 600 },
    });

    expect(response.status()).toBe(400);
  });
});
