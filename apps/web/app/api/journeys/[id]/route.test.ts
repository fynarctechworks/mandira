import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  getJourney: vi.fn(),
  rescheduleDays: vi.fn(),
}));

vi.mock("../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../../lib/journeys", () => ({ getJourney: state.getJourney }));
vi.mock("../../../../lib/replan", () => ({ rescheduleDays: state.rescheduleDays }));
vi.mock("../../../../lib/notifications", () => ({
  syncJourneyNotifications: async () => undefined,
}));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { PATCH } = await import("./route");

const JOURNEY = "00000000-0000-4000-8000-0000000000c1";

const detail = {
  journey: {
    id: JOURNEY,
    title: null,
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    timezone: "Asia/Kolkata",
    dayStartTime: "06:00",
    dayEndTime: "21:00",
    pace: "balanced",
    status: "upcoming",
    destinationId: "d1",
    knowledgeCheckedAt: null,
  },
  items: [{ id: "i1", day_index: 2, sort_order: 0, item_type: "experience", tier: "important" }],
  health: { journeyState: "comfortable", days: [] },
  labels: new Map(),
};

const request = (body: unknown) =>
  new Request(`https://mandhira.test/api/journeys/${JOURNEY}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({ user: SIGNED_IN, tables: { journeys: { data: null, error: null } } });
  state.client = fake.client;
  state.getJourney.mockReset().mockResolvedValue(detail);
  state.rescheduleDays.mockReset().mockResolvedValue(detail);
});

describe("PATCH /api/journeys/:id", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await PATCH(request({ title: "Tirumala" }))).status).toBe(401);
  });

  it("refuses a time that is not a time", async () => {
    expect((await PATCH(request({ dayStartTime: "25:00" }))).status).toBe(400);
  });

  it("refuses a day that ends before it starts", async () => {
    const response = await PATCH(request({ dayStartTime: "22:00" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/end after it starts/);
  });

  it("will not shorten a journey out from under what is planned on its last day", async () => {
    const response = await PATCH(request({ endDate: "2026-10-13" }));

    expect(response.status).toBe(409);
    expect(fake.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("answers someone else's journey as not found", async () => {
    state.getJourney.mockResolvedValue(null);
    expect((await PATCH(request({ title: "Mine now" }))).status).toBe(404);
  });

  it("renames without moving anything on the clock", async () => {
    const response = await PATCH(request({ title: "  Tirumala with Amma  " }));

    expect(response.status).toBe(200);
    expect(fake.calls).toContainEqual({
      table: "journeys",
      method: "update",
      args: [{ title: "Tirumala with Amma" }],
    });
    expect(state.rescheduleDays).not.toHaveBeenCalled();
  });

  it("puts every day back on the clock when the hours change", async () => {
    const response = await PATCH(request({ dayStartTime: "05:00" }));

    expect(response.status).toBe(200);
    expect(state.rescheduleDays).toHaveBeenCalledWith(fake.client, JOURNEY, "all");
    expect((await response.json()).data.health).toEqual(detail.health);
  });

  it("keeps the journey's length when only the first day moves", async () => {
    await PATCH(request({ startDate: "2026-10-20" }));

    expect(fake.calls).toContainEqual({
      table: "journeys",
      method: "update",
      args: [{ start_date: "2026-10-20", end_date: "2026-10-22" }],
    });
  });
});
