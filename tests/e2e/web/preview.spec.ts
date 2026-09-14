import { expect, test } from "@playwright/test";

/**
 * OPS-PREVIEW-01 — preview-as-app (PRD-OPS-CNT-001).
 *
 * Runs as the Ops admin inside the traveler app: one Supabase Auth serves both apps, and a
 * localhost cookie is shared across ports. The half that matters most is the end of the
 * first test — a traveler and a guest opening the same address see nothing of the draft.
 */
const OPS_URL = `http://localhost:${process.env["MANDHIRA_OPS_PORT"] ?? 3987}`;
const TRAVELER_STATE = "tests/e2e/.auth/traveler.json";
const RUN = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

test.describe("OPS-PREVIEW-01 — Preview in the app", () => {
  test("an operator previews a draft place, and no one else can open it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const name = `Preview Temple ${RUN}`;

    await page.goto(`${OPS_URL}/places/new`);
    await page.getByRole("tabpanel").first().getByRole("textbox").fill(name);
    await page.getByLabel("Slug").fill(`preview-${RUN}`);
    await page.getByLabel("Type").selectOption("temple");
    await page.getByRole("button", { name: "Create place" }).click();
    await expect(page).toHaveURL(/\/places\/[0-9a-f-]{36}$/);
    const id = UUID.exec(page.url())?.[0] ?? "";

    // The editor links to the preview, in each language.
    await expect(
      page
        .getByRole("navigation", { name: "Preview in the app" })
        .getByRole("link", { name: "English" }),
    ).toHaveAttribute("href", `${baseURL}/en/preview/places/${id}`);

    await page.goto(`/en/preview/places/${id}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Travelers cannot see this yet.", { exact: false })).toBeVisible();
    // Nothing on a preview writes against an entity travelers cannot see.
    await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);

    const traveler = await browser.newContext({ baseURL, storageState: TRAVELER_STATE });
    const travelerPage = await traveler.newPage();
    const response = await travelerPage.goto(`/en/preview/places/${id}`);
    expect(response?.status()).toBe(404);
    await expect(travelerPage.getByText(name)).toHaveCount(0);
    await traveler.close();

    // An empty state, said explicitly: a context made here otherwise inherits this project's
    // storageState, which is the Ops admin.
    const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const guestPage = await guest.newPage();
    await guestPage.goto(`/en/preview/places/${id}`);
    await expect(guestPage).toHaveURL(/\/en\/sign-in/);
    await expect(guestPage.getByText(name)).toHaveCount(0);
    await guest.close();
  });

  test("an operator previews an experience and is told whether travelers can see it", async ({
    page,
  }) => {
    await page.goto(`${OPS_URL}/experiences`);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const id = hrefs
      .map((href) => /^\/experiences\/([0-9a-f-]{36})$/.exec(href)?.[1])
      .find(Boolean);
    expect(id).toBeTruthy();

    await page.goto(`/en/preview/experiences/${id}`);
    await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeVisible();
    await expect(page.getByText(/Travelers (see this page now|cannot see this yet)/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
