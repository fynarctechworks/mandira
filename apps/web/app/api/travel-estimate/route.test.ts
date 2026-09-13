import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  ensureTravelEstimates: vi.fn(),
  readTravelEstimate: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../lib/travel", () => ({
  ensureTravelEstimates: state.ensureTravelEstimates,
  readTravelEstimate: state.readTravelEstimate,
}));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { GET } = await import("./route");

const TEMPLE = "d0000000-0000-4000-8000-00000000f002";
const HALL = "d0000000-0000-4000-8000-00000000f003";

const get = (query: string) =>
  GET(new Request(`https://mandhira.test/api/travel-estimate?${query}`, { method: "GET" }));

const bothPublished = { data: [{ id: TEMPLE }, { id: HALL }], error: null };

beforeEach(() => {
  state.client = fakeSupabase({
    user: SIGNED_IN,
    tables: { v_published_places: bothPublished },
  }).client;
  state.ensureTravelEstimates.mockReset().mockResolvedValue({ computed: 1, deferred: 0 });
  state.readTravelEstimate.mockReset().mockResolvedValue({
    distanceM: 850,
    durationSeconds: 660,
    provider: "ors:routed",
    cachedAt: "2026-09-13T06:00:00Z",
  });
});

describe("GET /api/travel-estimate", () => {
  it("asks a guest to sign in before spending routing quota", async () => {
    state.client = fakeSupabase({ user: null }).client;

    expect((await get(`fromPlaceId=${TEMPLE}&toPlaceId=${HALL}`)).status).toBe(401);
    expect(state.ensureTravelEstimates).not.toHaveBeenCalled();
  });

  it("refuses the same place twice", async () => {
    expect((await get(`fromPlaceId=${TEMPLE}&toPlaceId=${TEMPLE}`)).status).toBe(400);
  });

  it("does not route to a place that is not published", async () => {
    state.client = fakeSupabase({
      user: SIGNED_IN,
      tables: { v_published_places: { data: [{ id: TEMPLE }], error: null } },
    }).client;

    expect((await get(`fromPlaceId=${TEMPLE}&toPlaceId=${HALL}`)).status).toBe(404);
    expect(state.ensureTravelEstimates).not.toHaveBeenCalled();
  });

  it("routes the leg, then answers from the cache with its provider", async () => {
    const response = await get(`fromPlaceId=${TEMPLE}&toPlaceId=${HALL}&mode=vehicle`);

    expect(response.status).toBe(200);
    expect(state.ensureTravelEstimates).toHaveBeenCalledWith([{ from: TEMPLE, to: HALL }], {
      modes: ["vehicle"],
    });
    expect((await response.json()).data).toEqual({
      distanceM: 850,
      durationSeconds: 660,
      provider: "ors:routed",
      cachedAt: "2026-09-13T06:00:00Z",
    });
  });
});
