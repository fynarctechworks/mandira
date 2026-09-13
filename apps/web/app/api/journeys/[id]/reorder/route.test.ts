import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  getJourney: vi.fn(),
  rescheduleDays: vi.fn(),
}));

vi.mock("../../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../../../lib/journeys", () => ({ getJourney: state.getJourney }));
vi.mock("../../../../../lib/replan", () => ({ rescheduleDays: state.rescheduleDays }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");

const JOURNEY = "00000000-0000-4000-8000-0000000000c1";
const A = "00000000-0000-4000-8000-0000000000d1";
const B = "00000000-0000-4000-8000-0000000000d2";
const OTHER_DAY = "00000000-0000-4000-8000-0000000000d3";

const detail = {
  journey: { id: JOURNEY },
  items: [
    { id: A, day_index: 0, sort_order: 0 },
    { id: B, day_index: 0, sort_order: 1 },
    { id: OTHER_DAY, day_index: 1, sort_order: 0 },
  ],
  health: { journeyState: "tight", days: [] },
  labels: new Map(),
};

const request = (body: unknown) =>
  new Request(`https://mandhira.test/api/journeys/${JOURNEY}/reorder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({
    user: SIGNED_IN,
    rpc: { reorder_journey_items: { data: null, error: null } },
  });
  state.client = fake.client;
  state.getJourney.mockReset().mockResolvedValue(detail);
  state.rescheduleDays.mockReset().mockResolvedValue(detail);
});

describe("POST /api/journeys/:id/reorder", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await POST(request({ dayIndex: 0, orderedItemIds: [B, A] }))).status).toBe(401);
  });

  it("refuses an order that leaves something out, or brings in another day", async () => {
    expect((await POST(request({ dayIndex: 0, orderedItemIds: [B] }))).status).toBe(400);
    expect((await POST(request({ dayIndex: 0, orderedItemIds: [B, OTHER_DAY] }))).status).toBe(400);
    expect((await POST(request({ dayIndex: 0, orderedItemIds: [A, A] }))).status).toBe(400);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("refuses ids that are not ids", async () => {
    expect((await POST(request({ dayIndex: 0, orderedItemIds: ["first", "second"] }))).status).toBe(
      400,
    );
  });

  it("saves the new order and returns the day's new health", async () => {
    const response = await POST(request({ dayIndex: 0, orderedItemIds: [B, A] }));

    expect(response.status).toBe(200);
    expect(fake.rpcCalls).toEqual([
      {
        name: "reorder_journey_items",
        args: { p_journey_id: JOURNEY, p_day_index: 0, p_item_ids: [B, A] },
      },
    ]);
    expect(state.rescheduleDays).toHaveBeenCalledWith(fake.client, JOURNEY, [0]);
    expect((await response.json()).data.health).toEqual(detail.health);
  });
});
