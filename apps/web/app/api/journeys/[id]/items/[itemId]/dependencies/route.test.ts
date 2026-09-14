import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN, type QueryResult } from "../../../../../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../../../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));
vi.mock("../../../../../../../lib/notifications", () => ({ resyncNotifications: vi.fn() }));

const { PUT } = await import("./route");

const JOURNEY = "00000000-0000-4000-8000-0000000000d1";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b1";
const C = "00000000-0000-4000-8000-0000000000c1";

const JOURNEY_ROW = {
  id: JOURNEY,
  title: "Tirumala",
  start_date: "2026-10-12",
  end_date: "2026-10-13",
  timezone: "Asia/Kolkata",
  day_start_time: "06:00:00",
  day_end_time: "21:00:00",
  pace: "balanced",
  status: "upcoming",
  knowledge_checked_at: null,
};

const item = (id: string, day: number, order: number) => ({
  id,
  day_index: day,
  sort_order: order,
  item_type: "free_time",
  tier: "important",
  status: "planned",
});

let calls: { table: string; method: string; args: unknown[] }[] = [];

function signedIn(dependencies: { item_id: string; after_item_id: string }[] = []) {
  const tables: Record<string, QueryResult | QueryResult[]> = {
    journeys: { data: JOURNEY_ROW, error: null },
    journey_destinations: { data: null, error: null },
    journey_items: { data: [item(A, 0, 0), item(B, 0, 1), item(C, 1, 0)], error: null },
    journey_travelers: { data: [], error: null },
    journey_item_dependencies: { data: dependencies, error: null },
  };
  const fake = fakeSupabase({ user: SIGNED_IN, tables });
  state.client = fake.client;
  calls = fake.calls;
}

const put = (itemId: string, body: unknown) =>
  PUT(
    new Request(`https://mandhira.test/api/journeys/${JOURNEY}/items/${itemId}/dependencies`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const wrote = (method: string) =>
  calls.filter((call) => call.table === "journey_item_dependencies" && call.method === method);

beforeEach(() => {
  state.client = null;
  calls = [];
});

describe("PUT /api/journeys/:id/items/:itemId/dependencies", () => {
  it("plans an item after another on the same day", async () => {
    signedIn();
    const response = await put(B, { afterItemId: A });

    expect(response.status).toBe(200);
    expect(wrote("insert")[0]?.args[0]).toEqual({ item_id: B, after_item_id: A });
  });

  it("clears the order without adding one", async () => {
    signedIn([{ item_id: B, after_item_id: A }]);
    const response = await put(B, { afterItemId: null });

    expect(response.status).toBe(200);
    expect(wrote("delete")).toHaveLength(1);
    expect(wrote("insert")).toHaveLength(0);
  });

  it("refuses something on another day, and says to move it first", async () => {
    signedIn();
    const response = await put(A, { afterItemId: C });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/same day/);
    expect(wrote("insert")).toHaveLength(0);
  });

  it("refuses an order that would make two items wait for each other", async () => {
    signedIn([{ item_id: B, after_item_id: A }]);
    const response = await put(A, { afterItemId: B });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/wait for the other/);
  });

  it("refuses an item after itself", async () => {
    signedIn();
    expect((await put(A, { afterItemId: A })).status).toBe(400);
  });

  it("does not exist for an item outside the journey", async () => {
    signedIn();
    expect((await put("00000000-0000-4000-8000-0000000000ff", { afterItemId: A })).status).toBe(
      404,
    );
  });

  it("needs an account", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await put(B, { afterItemId: A })).status).toBe(401);
  });
});
