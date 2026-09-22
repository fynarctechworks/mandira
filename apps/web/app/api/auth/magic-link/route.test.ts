import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  signInWithOtp: vi.fn(),
  allowed: true,
  // PRD-PRIV-005: sign-in is closed until the consent notice is published (0054).
  legalReady: true,
}));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", () => ({
  // Both limits — per device in `withApi`, per address in the route — go through this client.
  createServiceRoleSupabase: () => ({
    rpc: async () => ({
      data: [
        {
          allowed: state.allowed,
          remaining: state.allowed ? 4 : 0,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      error: null,
    }),
  }),
}));
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");
const { hashEmail, safeNext } = await import("../../../../lib/magic-link");

const post = (body: unknown) =>
  POST(
    new Request("https://mandhira.test/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.allowed = true;
  state.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  state.legalReady = true;
  const fake = fakeSupabase({ user: null });
  (fake.client.auth as Record<string, unknown>)["signInWithOtp"] = state.signInWithOtp;
  (fake.client as Record<string, unknown>)["rpc"] = async (name: string) =>
    name === "legal_notices_ready"
      ? { data: state.legalReady, error: null }
      : { data: null, error: null };
  state.client = fake.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/magic-link", () => {
  it("sends a link that returns the traveler to where they were", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mandhira.in/");

    const response = await post({
      email: " Pilgrim@Example.org ",
      next: "/te/journeys/abc",
      adult: true,
    });

    expect(response.status).toBe(200);
    expect(state.signInWithOtp).toHaveBeenCalledWith({
      email: "pilgrim@example.org",
      options: {
        emailRedirectTo: "https://app.mandhira.in/auth/callback?next=%2Fte%2Fjourneys%2Fabc",
        shouldCreateUser: true,
      },
    });
  });

  it("never redirects to another site", async () => {
    await post({ email: "a@example.org", next: "//evil.example", adult: true });

    const options = state.signInWithOtp.mock.calls[0]?.[0].options;
    expect(options.emailRedirectTo).toBe("https://mandhira.test/auth/callback?next=%2Fen");
  });

  it("refuses an address that is not one, without calling Auth", async () => {
    expect((await post({ email: "not-an-email", adult: true })).status).toBe(400);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("is limited, and says so rather than sending", async () => {
    state.allowed = false;

    expect((await post({ email: "a@example.org", adult: true })).status).toBe(429);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("passes Auth's own limit on as a limit, and anything else as a plain retry", async () => {
    state.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { status: 429, message: "slow down" },
    });
    expect((await post({ email: "a@example.org", adult: true })).status).toBe(429);

    state.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { status: 500, message: "smtp" },
    });
    const response = await post({ email: "a@example.org", adult: true });
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toMatch(/couldn't send that link/);
  });

  /*
   * PRD-PRIV-004. The schema refuses rather than defaulting, so a caller that forgets the
   * field — a stale client, a script, a rebuilt form — cannot create the account the PRD
   * forbids. A 400 and no link sent is the whole assertion.
   */
  it("will not send a link to somebody who has not confirmed they are an adult", async () => {
    expect((await post({ email: "a@example.org" })).status).toBe(400);
    expect((await post({ email: "a@example.org", adult: false })).status).toBe(400);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  /*
   * PRD-PRIV-005. Consent to nothing is not consent, so until an admin has published the
   * notice and the grievance contact there is no account to be had — and the traveler is
   * told why rather than meeting a link that never arrives.
   */
  it("will not open an account before the consent notice is published", async () => {
    state.legalReady = false;

    const response = await post({ email: "a@example.org", adult: true });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toMatch(/what you would be agreeing to/);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("hashes an address so the limiter never stores it", () => {
    expect(hashEmail("A@Example.org")).toBe(hashEmail(" a@example.org"));
    expect(hashEmail("a@example.org")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps only same-site paths", () => {
    expect(safeNext("/en/prepare")).toBe("/en/prepare");
    expect(safeNext("https://evil.example")).toBe("/en");
    expect(safeNext("/\\evil.example")).toBe("/en");
    expect(safeNext(undefined)).toBe("/en");
  });
});
