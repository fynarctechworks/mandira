import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");

const request = (body: unknown) =>
  new Request("https://mandhira.test/api/travelers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const row = {
  id: "00000000-0000-4000-8000-0000000000b1",
  label: "Amma",
  mobility: "limited_walking",
  age_band: "senior",
  is_self: false,
};

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({
    user: SIGNED_IN,
    tables: { traveler_profiles: { data: row, error: null } },
  });
  state.client = fake.client;
});

describe("POST /api/travelers", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;

    const response = await POST(request({ mobility: "full", ageBand: "adult" }));
    expect(response.status).toBe(401);
  });

  it("refuses a mobility the planner does not know", async () => {
    const response = await POST(request({ mobility: "flying", ageBand: "adult" }));

    expect(response.status).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  it("adds the traveler to the signed-in account", async () => {
    const response = await POST(
      request({ label: "Amma", mobility: "limited_walking", ageBand: "senior" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.traveler).toEqual({
      id: row.id,
      label: "Amma",
      mobility: "limited_walking",
      ageBand: "senior",
      isSelf: false,
    });
    expect(fake.calls).toContainEqual({
      table: "traveler_profiles",
      method: "insert",
      args: [
        {
          owner_user_id: SIGNED_IN.id,
          label: "Amma",
          mobility: "limited_walking",
          age_band: "senior",
        },
      ],
    });
  });
});
