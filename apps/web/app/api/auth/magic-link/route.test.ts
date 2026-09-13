import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  signInWithOtp: vi.fn(),
  allowed: true,
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
  const fake = fakeSupabase({ user: null });
  (fake.client.auth as Record<string, unknown>)["signInWithOtp"] = state.signInWithOtp;
  state.client = fake.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/magic-link", () => {
  it("sends a link that returns the traveler to where they were", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mandhira.in/");

    const response = await post({ email: " Pilgrim@Example.org ", next: "/te/journeys/abc" });

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
    await post({ email: "a@example.org", next: "//evil.example" });

    const options = state.signInWithOtp.mock.calls[0]?.[0].options;
    expect(options.emailRedirectTo).toBe("https://mandhira.test/auth/callback?next=%2Fen");
  });

  it("refuses an address that is not one, without calling Auth", async () => {
    expect((await post({ email: "not-an-email" })).status).toBe(400);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("is limited, and says so rather than sending", async () => {
    state.allowed = false;

    expect((await post({ email: "a@example.org" })).status).toBe(429);
    expect(state.signInWithOtp).not.toHaveBeenCalled();
  });

  it("passes Auth's own limit on as a limit, and anything else as a plain retry", async () => {
    state.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { status: 429, message: "slow down" },
    });
    expect((await post({ email: "a@example.org" })).status).toBe(429);

    state.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { status: 500, message: "smtp" },
    });
    const response = await post({ email: "a@example.org" });
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toMatch(/couldn't send that link/);
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
