import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seriousViolations } from "../axe-exceptions";

/**
 * Submit / approve / publish (B-012).
 *
 * The seeded admin holds `admin`, which satisfies the approver check — but NOT the
 * separation-of-duties rule, because they are also the one making the edits. That makes
 * this suite a genuine test of the rule rather than a happy path: a single operator
 * cannot take a draft all the way to published, and should be told exactly why.
 */
const RUN = `b12-${Date.now().toString(36)}`;

test.describe.serial("Publishing", () => {
  test("a fresh place lists everything blocking publication, by field", async ({ page }) => {
    await page.goto("/destinations/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Pub Dest ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-dest`);
    await page.getByRole("button", { name: "Create destination" }).click();
    await expect(page.getByRole("heading", { name: `Pub Dest ${RUN}` })).toBeVisible();

    await page.goto("/places/new");
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(`Pub Temple ${RUN}`);
    await page.getByLabel("Slug").fill(`${RUN}-temple`);
    await page.getByRole("button", { name: "Create place" }).click();
    await expect(page.getByRole("heading", { name: `Pub Temple ${RUN}` })).toBeVisible();

    // The three critical fields are named, not merely counted (PRD F18 acceptance).
    // Scoped to the publishing section: the trust panels below name the same fields.
    const publishing = page.getByRole("region", { name: "Publishing" });
    await expect(publishing.getByText("3 things still to sort out:")).toBeVisible();
    await expect(
      publishing.getByRole("listitem").filter({ hasText: "Opening hours" }),
    ).toBeVisible();
    await expect(
      publishing.getByRole("listitem").filter({ hasText: "Entry requirements" }),
    ).toBeVisible();
    await expect(publishing.getByText("Travelers cannot see this yet.")).toBeVisible();
  });

  test("submitting moves it into review", async ({ page }) => {
    await page.goto("/places");
    await page.getByRole("link", { name: `Pub Temple ${RUN}` }).click();

    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("region", { name: "Publishing" })).toContainText("in review");

    // With problems outstanding, publishing must not be offered as available.
    await expect(page.getByRole("button", { name: "Approve and publish" })).toBeDisabled();
  });

  test("the approve queue separates ready from blocked", async ({ page }) => {
    await page.goto("/publish");

    const blocked = page.getByRole("listitem").filter({ hasText: `Pub Temple ${RUN}` });
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText("opening_schedule");
  });

  test("separation of duties refuses a self-approval, and says why", async ({ page }) => {
    // Clear the three critical fields so validation passes and only the duties rule remains.
    await page.goto("/sources/new");
    await page.getByLabel("Name").fill(`Pub Source ${RUN}`);
    await page.getByRole("button", { name: "Register source" }).click();
    await expect(page).toHaveURL(/\/sources$/);

    await page.goto("/places");
    await page.getByRole("link", { name: `Pub Temple ${RUN}` }).click();
    // Wait for the edit page before reading the URL — otherwise this captures the list.
    await expect(page.getByRole("heading", { name: `Pub Temple ${RUN}` })).toBeVisible();
    const placeUrl = page.url();

    for (const label of ["Opening hours", "Closure rules", "Entry requirements"]) {
      await page.goto(placeUrl);
      const panel = page.getByRole("group", { name: `Trust for ${label}` });
      await panel.getByRole("button", { name: /Add trust|Edit trust/ }).click();
      await panel.getByLabel("Status", { exact: true }).selectOption("human_reviewed");

      const sourceSelect = panel.getByLabel("Source", { exact: true });
      const value = await sourceSelect
        .locator("option", { hasText: RUN })
        .first()
        .getAttribute("value");
      await sourceSelect.selectOption(value!);
      await panel.getByRole("button", { name: "Save trust record" }).click();
      await expect(panel.getByText("● Clears the publish gate")).toBeVisible();
    }

    await page.goto(placeUrl);
    await expect(
      page.getByRole("region", { name: "Publishing" }).getByText("Nothing is blocking"),
    ).toBeVisible();

    // Now the only obstacle is that this operator made the last change themselves.
    await page.getByRole("button", { name: "Approve and publish" }).click();
    // Scope to the publishing section: Next mounts its own role="alert" route announcer.
    await expect(page.getByRole("region", { name: "Publishing" }).getByRole("alert")).toContainText(
      /different approver/,
    );

    // And it genuinely did not publish.
    await expect(
      page.getByRole("region", { name: "Publishing" }).getByText("Travelers cannot see this yet."),
    ).toBeVisible();
  });

  test("the media library requires a licence before upload", async ({ page }) => {
    await page.goto("/media");
    await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible();
    // Upload is unavailable until a file is chosen; the licence rule is stated up front.
    await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeDisabled();
    await expect(page.getByText(/Required. Anything attached to published content/)).toBeVisible();
  });

  test("the publish queue and media library are accessible", async ({ page }) => {
    for (const path of ["/publish", "/media"]) {
      await page.goto(path);
      expect(seriousViolations(await new AxeBuilder({ page }).analyze()), path).toEqual([]);
    }
  });
});
