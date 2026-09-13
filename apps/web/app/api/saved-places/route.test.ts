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

const { DELETE, POST } = await import("./route");

const PLACE = "d0000000-0000-4000-8000-00000000f002";

const post = (body: unknown) =>
  new Request("https://mandhira.test/api/saved-places", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({
    user: SIGNED_IN,
    tables: {
      v_published_places: { data: { id: PLACE }, error: null },
      saved_places: { data: null, error: null },
    },
  });
  state.client = fake.client;
});

describe("POST /api/saved-places", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await POST(post({ placeId: PLACE }))).status).toBe(401);
  });

  it("refuses something that is not a place id", async () => {
    expect((await POST(post({ placeId: "hill-temple" }))).status).toBe(400);
  });

  it("will not bookmark a place that is not published", async () => {
    fake = fakeSupabase({
      user: SIGNED_IN,
      tables: { v_published_places: { data: null, error: null } },
    });
    state.client = fake.client;

    expect((await POST(post({ placeId: PLACE }))).status).toBe(404);
    expect(fake.calls.some((call) => call.table === "saved_places")).toBe(false);
  });

  it("saves it for the signed-in traveler", async () => {
    const response = await POST(post({ placeId: PLACE }));

    expect(response.status).toBe(200);
    expect(fake.calls).toContainEqual({
      table: "saved_places",
      method: "upsert",
      args: [
        { user_id: SIGNED_IN.id, place_id: PLACE },
        { onConflict: "user_id,place_id", ignoreDuplicates: true },
      ],
    });
  });
});

describe("DELETE /api/saved-places", () => {
  it("unsaves only the traveler's own bookmark", async () => {
    const response = await DELETE(
      new Request(`https://mandhira.test/api/saved-places?placeId=${PLACE}`, { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ saved: false });
    expect(fake.calls).toContainEqual({
      table: "saved_places",
      method: "eq",
      args: ["user_id", SIGNED_IN.id],
    });
  });
});
