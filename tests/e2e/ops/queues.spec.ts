import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * The Freshness monitor and the Conflicts queue (B-030, PRD F18, OPS-WF-006/003).
 *
 * These are the two screens that exist so published knowledge does not rot quietly. Neither
 * shows anything broken — that is the point of both — so what a browser can usefully check
 * is that they SAY the right things:
 *
 *   * the freshness filters are PRD F18's five, and an empty result reads as a healthy
 *     state rather than as a missing number;
 *   * the Conflicts queue is honest that a decision there does not change the value, and
 *     that escalating deliberately leaves the field reading as uncertain.
 *
 * The rules themselves — which rows qualify, one task per field, escalate keeps the flag,
 * resolving edits no knowledge — are in pgTAP `0028` and `0029`, where they can be asserted
 * against the database rather than against a screen that declines to offer them.
 */
test.describe("O15 — Freshness monitor", () => {
  test("offers exactly PRD F18's filters", async ({ page }) => {
    await page.goto("/freshness");
    await expect(page.getByRole("heading", { name: "Freshness" })).toBeVisible();

    const filter = page.getByLabel("Show");
    for (const label of [
      "Everything",
      "Stale",
      "Aging",
      "Expiring within 30 days",
      "Low confidence",
      "Conflicted",
    ]) {
      await expect(filter.getByRole("option", { name: label })).toHaveCount(1);
    }
  });

  test("keeps the filter in the URL, so a view can be sent to somebody", async ({ page }) => {
    await page.goto("/freshness");

    await page.getByLabel("Show").selectOption("stale");
    await page.getByRole("button", { name: "Apply" }).click();

    // A GET form, like search and the brief (D-089). "Everything stale in Devagiri" has to
    // be a link, or it is a thing each person has to reconstruct by hand every week.
    await expect(page).toHaveURL(/filter=stale/);
  });

  test("an empty result reads as a healthy state, not a missing number", async ({ page }) => {
    await page.goto("/freshness?filter=conflict");

    const rows = page.getByRole("row");
    const empty = page.getByText(/healthy state, not an empty one|nothing to keep an eye on/);

    // Whichever is true of this database, one of them must be on screen.
    expect((await rows.count()) + (await empty.count())).toBeGreaterThan(0);
  });

  test("says what a row means in words, not colour alone", async ({ page }) => {
    await page.goto("/freshness");

    const table = page.getByRole("table");
    if ((await table.count()) === 0) test.skip(true, "nothing published with a critical field");

    // PRD §12.8: icon or word beside colour, always. A freshness table is exactly where a
    // row of coloured dots would otherwise be doing all the work.
    await expect(table.getByRole("columnheader", { name: "State" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Last checked" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Against" })).toBeVisible();
  });

  test("the freshness monitor is accessible", async ({ page }) => {
    await page.goto("/freshness");
    await expect(page.getByRole("heading", { name: "Freshness" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test.describe("O12 — Conflicts", () => {
  test("says that settling one does not change the value", async ({ page }) => {
    await page.goto("/conflicts");
    await expect(page.getByRole("heading", { name: "Conflicts" })).toBeVisible();

    /*
     * On the screen, not only enforced in SQL. An operator who believes resolving a
     * conflict corrects the fact will stop making the separate edit — and the knowledge
     * rots while the queue looks healthy.
     */
    await expect(page.getByText(/separate edit through the publish gate/)).toBeVisible();
  });

  test("is honest about why nothing is detected automatically", async ({ page }) => {
    await page.goto("/conflicts");

    const empty = page.getByText(/No source disagreements recorded/);
    if ((await empty.count()) === 0) test.skip(true, "this database already has conflicts");

    // Shown as absent rather than hidden, like AI extraction on O09 (D-105's reasoning):
    // a queue that silently lacks its detection half is one an operator trusts wrongly.
    await expect(page.getByText(/waiting on a provider key/)).toBeVisible();
    await expect(page.getByText(/raised from a field/)).toBeVisible();
  });

  test("has no publish control anywhere on it", async ({ page }) => {
    await page.goto("/conflicts");

    // Asserted on the rendered page, because the SQL being right does not stop a button
    // from appearing — the same check the Review queue carries.
    await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^publish$/i })).toHaveCount(0);
  });

  test("the conflicts queue is accessible", async ({ page }) => {
    await page.goto("/conflicts");
    await expect(page.getByRole("heading", { name: "Conflicts" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test("both queues are reachable from the Ops nav", async ({ page }) => {
  await page.goto("/");

  // They were `comingIn: "M3"` placeholders until this item.
  const nav = page.getByLabel("Operations sections");
  await expect(nav.getByRole("link", { name: /Freshness monitor/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Conflicts/ })).toBeVisible();
});
