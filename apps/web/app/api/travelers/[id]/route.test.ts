import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN, type QueryResult } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { DELETE, PATCH } = await import("./route");

const ID = "00000000-0000-4000-8000-0000000000b1";

const request = (method: string, body?: unknown, id = ID) =>
  new Request(`https://mandhira.test/api/travelers/${id}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

let fake: ReturnType<typeof fakeSupabase>;

function withTravelers(result: QueryResult | QueryResult[], user = SIGNED_IN) {
  fake = fakeSupabase({ user, tables: { traveler_profiles: result } });
  state.client = fake.client;
}

beforeEach(() => withTravelers({ data: null, error: null }));

describe("PATCH /api/travelers/:id", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await PATCH(request("PATCH", { ageBand: "senior" }))).status).toBe(401);
  });

  it("refuses a change that changes nothing", async () => {
    expect((await PATCH(request("PATCH", {}))).status).toBe(400);
  });

  it("answers someone else's traveler as not found", async () => {
    expect((await PATCH(request("PATCH", { ageBand: "senior" }))).status).toBe(404);
  });

  it("saves the change", async () => {
    withTravelers({
      data: { id: ID, label: "Nanna", mobility: "full", age_band: "senior", is_self: false },
      error: null,
    });

    const response = await PATCH(request("PATCH", { ageBand: "senior" }));

    expect(response.status).toBe(200);
    expect(fake.calls).toContainEqual({
      table: "traveler_profiles",
      method: "update",
      args: [{ age_band: "senior" }],
    });
  });
});

describe("DELETE /api/travelers/:id", () => {
  it("keeps the traveler's own profile", async () => {
    withTravelers({ data: { id: ID, is_self: true }, error: null });

    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(403);
    expect(fake.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("removes someone else softly", async () => {
    withTravelers([
      { data: { id: ID, is_self: false }, error: null },
      { data: null, error: null },
    ]);

    const response = await DELETE(request("DELETE"));

    expect(response.status).toBe(200);
    const update = fake.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({ deleted_at: expect.any(String) });
  });

  it("answers a malformed id as not found without querying", async () => {
    expect((await DELETE(request("DELETE", undefined, "not-an-id"))).status).toBe(404);
    expect(fake.calls).toEqual([]);
  });
});
