import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Ingestion and the Review queue (B-029, PRD F17/F18, OPS-SRC-02, OPS-WF-001).
 *
 * WHAT THIS FILE CAN AND CANNOT REACH. The capture provider refuses loopback and private
 * addresses — that guard is the security control for a feature whose whole job is fetching
 * URLs an operator typed, and relaxing it so a test could point at a fixture server on
 * localhost is precisely the "temporarily" CLAUDE.md §5 forbids. So the HTTP half is tested
 * directly in `packages/providers` (35 unit tests, including every refusal), the detection
 * half likewise, and the candidate/permission half in pgTAP `0025`.
 *
 * What is left for a browser is what only a browser can check: that the screens say the
 * right things, that the queue offers PRD F18's four actions, that a rejection needs a
 * reason, and — the important one — that **nothing on the Review queue is a way to
 * publish**.
 */
const RUN_ID = String(Date.now()).slice(-8);

/** Creates a monitored source through the registry UI, the way an operator would. */
async function createMonitoredSource(page: Page, name: string, url: string): Promise<void> {
  await page.goto("/sources/new");

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Kind of source").selectOption("official_authority");
  await page.getByLabel("URL", { exact: true }).fill(url);

  // The control that makes a source watched at all. Before B-029 the form hardcoded
  // "manual", so nothing could ever be monitored however well the pipeline behaved.
  await page.getByLabel("Ingestion method").selectOption("url_monitor");

  await page.getByRole("button", { name: "Register source" }).click();
  await expect(page).toHaveURL(/\/sources$/);
}

test.describe("O09 — Ingestion", () => {
  test("says plainly when nothing is being watched, rather than showing an empty table", async ({
    page,
  }) => {
    await page.goto("/ingestion");
    await expect(page.getByRole("heading", { name: "Ingestion" })).toBeVisible();

    // Either state is legitimate depending on what earlier specs left behind; what must
    // never appear is a bare table with no explanation.
    const empty = page.getByText("No source is being watched yet.");
    const rows = page.locator("li", { hasText: "Last looked" });

    expect((await empty.count()) + (await rows.count())).toBeGreaterThan(0);
  });

  test("is honest that AI extraction is not available", async ({ page }) => {
    await page.goto("/ingestion");

    /*
     * Shown as absent rather than hidden. A queue that silently lacks half its promised
     * capability is one an operator discovers is incomplete at the worst moment — the same
     * reasoning that keeps routing honest without an ORS key (D-105).
     */
    await expect(page.getByRole("heading", { name: "AI extraction" })).toBeVisible();
    await expect(page.getByText(/needs an AI provider key/)).toBeVisible();
    await expect(page.getByText(/never able to publish/)).toBeVisible();
  });

  test("records a run it could not complete, instead of leaving the row looking old", async ({
    page,
  }) => {
    /*
     * A URL that resolves to nothing. The point is not the failure — it is that the failure
     * is WRITTEN DOWN. A run that silently skips is indistinguishable from a source that
     * has not changed, which is how a source stops being monitored for six weeks without
     * anybody noticing (the same mistake `unavailable` weather readings avoid, D-132).
     */
    await createMonitoredSource(
      page,
      `Unreachable fixture ${RUN_ID}`,
      "https://nothing.example.invalid/timings",
    );

    await page.goto("/ingestion");
    const row = page.locator("li", { hasText: `Unreachable fixture ${RUN_ID}` });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Run now" }).click();

    // The run's own outcome line, not the summary chip above it — both say "could not
    // read", and asserting on whichever matches first is how a test stops meaning anything.
    await expect(row.getByRole("status")).toContainText(/Could not read the source/i, {
      timeout: 30_000,
    });
  });

  test("the ingestion screen is accessible", async ({ page }) => {
    await page.goto("/ingestion");
    await expect(page.getByRole("heading", { name: "Ingestion" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test.describe("O10 — Review queue", () => {
  test("says what a decision here can and cannot do", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

    /*
     * PRD F18's constraint, said on the screen and not only enforced in SQL. An operator
     * who believes accepting a candidate corrects the fact will stop making the separate
     * edit, and the knowledge quietly rots while the queue looks healthy.
     */
    await expect(page.getByText(/separate edit through the publish gate/)).toBeVisible();
  });

  test("offers exactly PRD F18's actions, and no publish control", async ({ page }) => {
    await page.goto("/review");

    const card = page.locator("li", { hasText: "What the source used to say" }).first();

    if ((await card.count()) === 0) {
      // Nothing waiting is the healthy state, and it must read as one.
      await expect(page.getByText(/That is the healthy state, not an empty one/)).toBeVisible();
      return;
    }

    await expect(card.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Send to Verify" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Reject" })).toBeVisible();

    // "Edit & accept" is a LINK to the editor, because the edit belongs behind the gate.
    await expect(card.getByRole("link", { name: "Open the editor" })).toBeVisible();

    // And there is no way to publish from here. Asserted on the rendered page, because the
    // SQL constraint being right does not stop a button from appearing.
    await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^publish$/i })).toHaveCount(0);
  });

  test("will not let a rejection go unexplained", async ({ page }) => {
    await page.goto("/review");

    const card = page.locator("li", { hasText: "What the source used to say" }).first();
    if ((await card.count()) === 0) test.skip(true, "no candidate waiting in this run");

    await card.getByRole("button", { name: "Reject" }).click();

    // A queue that forgets why something was dismissed raises it again next cycle, to
    // somebody with none of the context.
    await expect(page.getByText(/Say why you are rejecting it/)).toBeVisible();
  });

  test("the review queue is accessible", async ({ page }) => {
    await page.goto("/review");
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(seriousViolations(results)).toEqual([]);
  });
});

test("both screens are reachable from the Ops nav", async ({ page }) => {
  await page.goto("/");

  // They were `comingIn: "M3"` placeholders until this item; the nav test asserts that
  // exactly the built screens are links and the rest are inert.
  await expect(page.getByRole("link", { name: /Ingestion & AI extraction/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Review queue/ })).toBeVisible();
});
