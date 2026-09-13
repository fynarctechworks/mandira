import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");

const request = (body?: string) =>
  new Request("https://mandhira.test/api/account/export", {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });

beforeEach(() => {
  state.client = fakeSupabase({ user: null }).client;
});

describe("POST /api/account/export", () => {
  it("asks a guest to sign in, as an envelope rather than a file", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect((await response.json()).ok).toBe(false);
  });

  it("refuses a request that sends input it does not take", async () => {
    state.client = fakeSupabase({ user: SIGNED_IN }).client;

    expect((await POST(request(JSON.stringify({ userId: "someone-else" })))).status).toBe(400);
  });

  it("hands the traveler their data as a file", async () => {
    const data = { account: { id: SIGNED_IN.id }, journeys: [] };
    const fake = fakeSupabase({ user: SIGNED_IN, rpc: { export_my_data: { data, error: null } } });
    state.client = fake.client;

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="mandhira-my-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(await response.text())).toEqual(data);
    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["export_my_data"]);
  });
});
