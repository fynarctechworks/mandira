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

const { PATCH } = await import("./route");

const request = (body: unknown) =>
  new Request("https://mandhira.test/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({ user: SIGNED_IN, tables: { profiles: { data: null, error: null } } });
  state.client = fake.client;
});

describe("PATCH /api/account/profile", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await PATCH(request({ locale: "te" }))).status).toBe(401);
  });

  it("refuses a language Mandhira does not offer, and an empty change", async () => {
    expect((await PATCH(request({ locale: "fr" }))).status).toBe(400);
    expect((await PATCH(request({}))).status).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  it("saves the language on the traveler's own profile", async () => {
    const response = await PATCH(request({ locale: "te" }));

    expect(response.status).toBe(200);
    expect(fake.calls).toContainEqual({
      table: "profiles",
      method: "update",
      args: [{ locale: "te" }],
    });
    expect(fake.calls).toContainEqual({
      table: "profiles",
      method: "eq",
      args: ["id", SIGNED_IN.id],
    });
  });

  it("stores a blank name as no name", async () => {
    await PATCH(request({ displayName: "   " }));

    expect(fake.calls).toContainEqual({
      table: "profiles",
      method: "update",
      args: [{ display_name: null }],
    });
  });
});
