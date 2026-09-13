import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Phrase packs (O18, PRD-OPS-CNT-004).
 *
 * Writes real rows through the real server actions: Zod, the role check, RLS and the publish
 * guard. Phrases are suffixed per run so repeated runs are distinguishable in the list.
 *
 * Session comes from the ops-setup project (signed in as the seeded admin).
 */
const RUN = `e2e-${Date.now().toString(36)}`;

test.describe("Phrase packs", () => {
  test("are in the navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Phrase packs" }).click();

    await expect(page).toHaveURL(/\/phrases$/);
    await expect(page.getByRole("heading", { level: 1, name: "Phrase packs" })).toBeVisible();
  });

  test("drafts a phrase with a translation, then submits it for review", async ({ page }) => {
    const source = `Please help us (${RUN})`;

    await page.goto("/phrases/new");
    await page.getByLabel("Situation").selectOption("help");
    await page.getByLabel("Phrase", { exact: true }).fill(source);

    // The source language (English) gets no translation tab; Telugu is the first.
    const phrase = page.getByRole("group", { name: "The phrase in each language" });
    await expect(phrase.getByRole("tab", { name: /English/ })).toHaveCount(0);
    await phrase.getByRole("tabpanel").first().getByRole("textbox").fill("దయచేసి సహాయం చేయండి");

    const say = page.getByRole("group", { name: "How to say it (in Latin letters)" });
    await say.getByRole("tabpanel").first().getByRole("textbox").fill("dayachesi sahayam cheyandi");

    await page.getByRole("button", { name: "Create phrase" }).click();

    // Landing on the edit page means the row was created and read back.
    await expect(page.getByRole("heading", { level: 1, name: source })).toBeVisible();
    await expect(page.getByText("Travelers cannot see this yet.")).toBeVisible();
    // The translation survived the round-trip through `translations` jsonb.
    await expect(phrase.getByRole("tabpanel").first().getByRole("textbox")).toHaveValue(
      "దయచేసి సహాయం చేయండి",
    );

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("button", { name: "Approve and publish" })).toBeVisible();

    await page.goto("/phrases");
    await expect(page.getByRole("link", { name: source })).toBeVisible();
  });

  test("refuses a transliteration with no phrase beside it", async ({ page }) => {
    await page.goto("/phrases/new");
    await page.getByLabel("Phrase", { exact: true }).fill(`Half a translation (${RUN})`);

    const say = page.getByRole("group", { name: "How to say it (in Latin letters)" });
    await say.getByRole("tabpanel").first().getByRole("textbox").fill("sahayam");

    await page.getByRole("button", { name: "Create phrase" }).click();
    await expect(page.getByText("Add the phrase itself before its transliteration")).toBeVisible();
    await expect(page.getByLabel("Phrase", { exact: true })).toHaveValue(
      `Half a translation (${RUN})`,
    );
  });

  test("have no serious accessibility violations", async ({ page }) => {
    for (const url of ["/phrases", "/phrases/new"]) {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).analyze();
      expect(seriousViolations(results), url).toEqual([]);
    }
  });
});
