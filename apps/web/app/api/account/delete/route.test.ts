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

const { DELETE, POST } = await import("./route");

const request = (method: string, body?: unknown) =>
  new Request("https://mandhira.test/api/account/delete", {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

let fake: ReturnType<typeof fakeSupabase>;

function signedIn(rpc: Parameters<typeof fakeSupabase>[0]["rpc"] = {}) {
  fake = fakeSupabase({ user: SIGNED_IN, rpc });
  state.client = fake.client;
}

beforeEach(() => {
  fake = fakeSupabase({ user: null });
  state.client = fake.client;
});

describe("POST /api/account/delete", () => {
  it("asks a guest to sign in and starts nothing", async () => {
    const response = await POST(request("POST", { confirm: true }));

    expect(response.status).toBe(401);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("refuses without an explicit confirmation", async () => {
    signedIn();

    expect((await POST(request("POST", {}))).status).toBe(400);
    expect((await POST(request("POST", { confirm: "yes" }))).status).toBe(400);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("schedules erasure and says when", async () => {
    signedIn({ request_account_deletion: { data: "2026-10-13T06:00:00+00:00", error: null } });

    const response = await POST(request("POST", { confirm: true }));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ scheduledFor: "2026-10-13T06:00:00.000Z" });
    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["request_account_deletion"]);
  });
});

describe("DELETE /api/account/delete", () => {
  it("asks a guest to sign in", async () => {
    expect((await DELETE(request("DELETE"))).status).toBe(401);
  });

  it("keeps the account", async () => {
    signedIn({ cancel_account_deletion: { data: null, error: null } });

    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ scheduledFor: null });
    expect(fake.rpcCalls.map((call) => call.name)).toEqual(["cancel_account_deletion"]);
  });
});
