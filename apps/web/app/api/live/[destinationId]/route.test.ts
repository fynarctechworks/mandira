import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown, getLiveConditions: vi.fn() }));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../../lib/live-conditions", () => ({ getLiveConditions: state.getLiveConditions }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { GET } = await import("./route");

const DESTINATION = "d0000000-0000-4000-8000-00000000f001";

const get = (id: string, query = "") =>
  GET(new Request(`https://mandhira.test/api/live/${id}${query}`, { method: "GET" }));

beforeEach(() => {
  state.client = fakeSupabase({ user: null }).client;
  state.getLiveConditions.mockReset().mockResolvedValue([
    {
      feedKind: "weather",
      provider: "Open-Meteo",
      readAt: "2026-09-13T06:00:00Z",
      degraded: true,
      label: "Live update unavailable — showing last known (as of 11:30 AM).",
      hours: [],
      disruptive: [],
    },
  ]);
});

describe("GET /api/live/:destinationId", () => {
  it("answers a guest, and says plainly when a feed is not live", async () => {
    const response = await get(DESTINATION);

    expect(response.status).toBe(200);
    expect((await response.json()).data.feeds).toEqual([
      {
        kind: "weather",
        provider: "Open-Meteo",
        readAt: "2026-09-13T06:00:00Z",
        status: "unavailable",
        label: "Live update unavailable — showing last known (as of 11:30 AM).",
        data: { hours: [], disruptive: [] },
      },
    ]);
    expect(state.getLiveConditions).toHaveBeenCalledWith(state.client, DESTINATION, "en");
  });

  it("refuses a language it does not serve", async () => {
    expect((await get(DESTINATION, "?locale=fr")).status).toBe(400);
  });

  it("answers a malformed destination as not found without reading anything", async () => {
    expect((await get("devagiri")).status).toBe(404);
    expect(state.getLiveConditions).not.toHaveBeenCalled();
  });
});
