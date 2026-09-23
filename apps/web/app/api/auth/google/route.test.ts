import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  signInWithOAuth: vi.fn(),
  legalReady: true,
}));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", () => ({
  createServiceRoleSupabase: () => ({
    rpc: async () => ({
      data: [
        { allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() },
      ],
      error: null,
    }),
  }),
}));
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new Request("https://mandhira.test/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.legalReady = true;
  state.signInWithOAuth
    .mockReset()
    .mockResolvedValue({ data: { url: "https://accounts.google.test/o/oauth2" }, error: null });
  const fake = fakeSupabase({ user: null });
  (fake.client.auth as Record<string, unknown>)["signInWithOAuth"] = state.signInWithOAuth;
  (fake.client as Record<string, unknown>)["rpc"] = async (name: string) =>
    name === "legal_notices_ready"
      ? { data: state.legalReady, error: null }
      : { data: null, error: null };
  state.client = fake.client;
});

describe("POST /api/auth/google (PRD-ACCT-001)", () => {
  it("hands back Google's URL, returning the traveler to where they were", async () => {
    const response = await post({ next: "/te/journeys/abc", adult: true });

    expect(response.status).toBe(200);
    expect((await response.json()).data.url).toBe("https://accounts.google.test/o/oauth2");
    expect(state.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining(encodeURIComponent("/te/journeys/abc")),
          // The URL comes back to the browser so the PKCE cookie is set first.
          skipBrowserRedirect: true,
        }),
      }),
    );
  });

  /*
   * The whole reason this goes through the server. A Google button that skipped the adult
   * confirmation would be a side door around PRD-PRIV-004 — and the door most people use.
   */
  it("will not start without the adult confirmation", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ adult: false })).status).toBe(400);
    expect(state.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("will not open an account before the consent notice is published", async () => {
    state.legalReady = false;

    const response = await post({ adult: true });

    expect(response.status).toBe(403);
    expect(state.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("never redirects to another site after sign-in", async () => {
    await post({ next: "//evil.example", adult: true });

    const [call] = state.signInWithOAuth.mock.calls;
    expect(call?.[0].options.redirectTo).not.toContain("evil.example");
  });

  it("says plainly when Google is not available, and points at the email link", async () => {
    state.signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { message: "provider disabled" },
    });

    const response = await post({ adult: true });

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toMatch(/email link instead/);
  });
});
