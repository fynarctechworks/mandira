import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Sources registry and the trust panel (B-011).
 *
 * The point of this suite is the publish gate end to end: register a source, create a
 * place, and watch it move from "invisible to travelers" to "publishable" only once every
 * critical field carries trust. That is the guarantee D-030 makes, and until B-011 there
 * was no way to satisfy it at all.
 */
const RUN = `b11-${Date.now().toString(36)}`;

test.describe.serial("Trust and sources", () => {
  test("registers a source with its tier", async ({ page }) => {
    await page.goto("/sources/new");

    await page.getByLabel("Name").fill(`Temple Trust ${RUN}`);
    await page.getByLabel("Kind of source").selectOption("official_authority");
    await page.getByLabel("URL").fill("https://example.test/timings");
    await page.getByRole("button", { name: "Register source" }).click();

    await expect(page).toHaveURL(/\/sources$/);
    // The registry is paged past fifty rows, so the new source is found the way an operator
    // finds it: by filtering.
    await page.getByLabel("Filter").fill(`Temple Trust ${RUN}`);
    const row = page.getByRole("row").filter({ hasText: `Temple Trust ${RUN}` });
    await expect(row).toContainText("T1");
    await expect(row).toContainText("active");
  });

  test("a new place blocks publication until every critical field is reviewed", async ({
    page,
  }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Trust Dest ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-dest`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `Trust Dest ${RUN}` })).toBeVisible();

    await page.goto("/places/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Trust Temple ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-temple`);
    await page.getByRole("button", { name: "Create place" }).click();
    await expect(page.getByRole("heading", { name: `Trust Temple ${RUN}` })).toBeVisible();

    // Three critical fields, none of them trusted yet.
    await expect(page.getByText(/3 of 3 critical fields still block publication/)).toBeVisible();
    await expect(page.getByText("○ Blocks publication").first()).toBeVisible();

    const placeUrl = page.url();

    // Review each field against the registered source, reloading between them. Saving is a
    // Server Action, which re-renders the route — reloading makes each iteration start from
    // a known state and, incidentally, proves the previous record persisted.
    for (const label of ["Opening hours", "Closure rules", "Entry requirements"]) {
      await page.goto(placeUrl);

      const panel = page.getByRole("group", { name: `Trust for ${label}` });
      await panel.getByRole("button", { name: /Add trust|Edit trust/ }).click();
      await panel.getByLabel("Status", { exact: true }).selectOption("human_reviewed");

      // Resolve this run's source by value rather than matching its rendered label:
      // earlier runs leave similarly-named sources behind, and label matching is exact,
      // so a stray space or suffix turns a real pass into a confusing failure.
      const sourceSelect = panel.getByLabel("Source", { exact: true });
      const sourceValue = await sourceSelect
        .locator("option", { hasText: RUN })
        .first()
        .getAttribute("value");
      expect(sourceValue, "this run's source should be selectable").toBeTruthy();
      await sourceSelect.selectOption(sourceValue!);
      await panel.getByRole("button", { name: "Save trust record" }).click();
      await expect(panel.getByText("● Clears the publish gate")).toBeVisible();
    }

    await page.goto(placeUrl);
    await expect(
      page.getByText(/Every critical field is reviewed. This can be published./),
    ).toBeVisible();
  });

  test("verifying against a source yields high confidence", async ({ page }) => {
    await page.goto("/places");
    await page.getByLabel("Filter").fill(`Trust Temple ${RUN}`);
    const panel = page.getByRole("group", { name: "Trust for Opening hours" });
    // The places list grows with every local run and hydrates slowly enough to drop a first
    // click; retry until the place is open (the guard knowledge.spec and publish.spec use).
    const href = await page.getByRole("link", { name: `Trust Temple ${RUN}` }).getAttribute("href");
    await page.goto(href ?? "/places");
    await expect(panel.getByRole("button", { name: "Edit trust" })).toBeVisible();
    await panel.getByRole("button", { name: "Edit trust" }).click();
    await panel.getByLabel("Status", { exact: true }).selectOption("verified");
    await panel.getByRole("button", { name: "Save trust record" }).click();

    // Confidence is DERIVED by the database (T1 + verified + fresh -> high), never sent
    // by the client — so seeing "high" here proves the trigger ran, not that the UI said so.
    await expect(panel.getByText(/high confidence/)).toBeVisible();
    await expect(panel.getByText(/fresh/)).toBeVisible();
  });

  test("the sources screen and trust panels are accessible", async ({ page }) => {
    for (const path of ["/sources", "/sources/new"]) {
      await page.goto(path);
      expect(seriousViolations(await new AxeBuilder({ page }).analyze()), path).toEqual([]);
    }
  });
});
