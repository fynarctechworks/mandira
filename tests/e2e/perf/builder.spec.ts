import { expect, test, type Page } from "@playwright/test";

import { useReferenceDevice } from "./reference-device";

/**
 * PRD-PLAN-009: "3-day/12-item journey built + retiered ≤ 5 min mobile; Health updates
 * ≤ 500 ms."
 *
 * The second half is already proven in the engine suite, on inputs rather than on a screen.
 * This is the first half, which nothing measured: how long it actually takes to build a
 * real journey and re-tier it, on the reference device, through the interface.
 *
 * WHAT THE FIVE MINUTES MEANS. The requirement is about a person's time, and a person
 * reads, thinks and mistypes — none of which a script does. So this measures the part that
 * is the product's fault: every tap's round trip, the reschedule behind it, and the health
 * recompute after. A budget of 90 seconds of machine time against a 5-minute human budget
 * leaves roughly three and a half minutes for the human, which is the shape of the promise.
 * If the machine half alone approaches five minutes the requirement is already lost.
 *
 * Run with `pnpm perf`.
 */

/*
 * The perf destination (seed 0004), not the fixture one.
 *
 * A journey holds each experience once, and the fixture destination has three — so a
 * twelve-item journey could not be built against it at all, which is why this number had
 * never been measured. Sixteen here leave room for twelve plus the two the brief places.
 */
const PERF = {
  destination: "d0000000-0000-4000-8000-00000000e001",
  experience: (n: number) => `d0000000-0000-4000-8000-00000000e1${String(n).padStart(2, "0")}`,
};

const BRIEF = {
  destinationId: PERF.destination,
  startDate: "2026-10-12",
  dayCount: 3,
  pace: "balanced" as const,
  mustDo: [PERF.experience(1)],
  wouldLike: [PERF.experience(2)],
  travelers: [{ mobility: "full", ageBand: "adult" }],
};

/** The machine's share of the five minutes. See the note above. */
const MACHINE_BUDGET_MS = 90_000;
/** PRD-PLAN-009's other half, measured through the API that serves the screen. */
const HEALTH_BUDGET_MS = 500;

function report(what: string, measured: number, budget: number): void {
  const verdict = measured <= budget ? "within" : "OVER";
  // eslint-disable-next-line no-console -- the measurement IS the output of this suite.
  console.log(
    `  ${what.padEnd(34)} ${Math.round(measured).toString().padStart(6)} ms  ${verdict} ${budget} ms`,
  );
}

async function addItem(page: Page, journeyId: string, experienceId: string, dayIndex: number) {
  const response = await page.request.post(`/api/journeys/${journeyId}/items`, {
    data: { experienceId, tier: "important", dayIndex },
  });
  expect(response.ok(), `adding an item answered ${response.status()}`).toBe(true);
  return response;
}

test.describe("PRD-PLAN-009 — building a real journey on the reference device", () => {
  test("a 3-day, 12-item journey is built and re-tiered inside its budget", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      const started = Date.now();

      const created = await page.request.post("/api/journeys", { data: BRIEF });
      expect(created.ok(), `creating answered ${created.status()}`).toBe(true);
      const journeyId = (await created.json()).data.journeyId as string;

      /*
       * Twelve items across three days. The brief placed two, so ten more, each a
       * different experience — a journey holds each of them once, and every add pays for
       * a reschedule and a health recompute, which is the cost being measured.
       */
      const items: string[] = [];
      for (let n = 3; n <= 12; n++) {
        const response = await addItem(page, journeyId, PERF.experience(n), (n - 3) % 3);
        const body = await response.json();
        const added = (body.data.items as { id: string }[]).at(-1);
        if (added) items.push(added.id);
      }

      // Re-tiering: the traveler saying what actually matters, which is the whole point of
      // the builder and the most expensive tap in it (it reschedules and re-scores).
      for (const itemId of items.slice(0, 4)) {
        const response = await page.request.patch(`/api/journeys/${journeyId}/items/${itemId}`, {
          data: { tier: "protected", confirmed: true },
        });
        expect(response.ok(), `re-tiering answered ${response.status()}`).toBe(true);
      }

      // And the screen a traveler would be looking at the whole time.
      await page.goto(`/en/journeys/${journeyId}`, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1 }).first().waitFor();

      const elapsed = Date.now() - started;
      report("Build + re-tier (machine share)", elapsed, MACHINE_BUDGET_MS);
      expect(elapsed).toBeLessThanOrEqual(MACHINE_BUDGET_MS);
    } finally {
      await restore();
    }
  });

  test("health comes back with the plan, inside 500 ms", async ({ page }) => {
    const restore = await useReferenceDevice(page);
    try {
      const created = await page.request.post("/api/journeys", { data: BRIEF });
      const journeyId = (await created.json()).data.journeyId as string;

      // Five samples: the budget is a p95, and one sample is an anecdote. Each adds a
      // DIFFERENT experience, because a journey holds each of them once.
      const samples: number[] = [];
      for (let n = 3; n <= 7; n++) {
        const started = Date.now();
        const response = await addItem(page, journeyId, PERF.experience(n), (n - 3) % 3);
        samples.push(Date.now() - started);

        const body = await response.json();
        expect(body.data.health, "a mutation answered without health").toBeTruthy();
      }

      const worst = Math.max(...samples);
      report("Add item → items + health (worst)", worst, HEALTH_BUDGET_MS);
      expect(worst).toBeLessThanOrEqual(HEALTH_BUDGET_MS);
    } finally {
      await restore();
    }
  });
});
