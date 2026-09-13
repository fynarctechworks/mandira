import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../../../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  getJourney: vi.fn(),
  getKnowledgeBundle: vi.fn(),
  rescheduleDays: vi.fn(),
}));

vi.mock("../../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../../../lib/journeys", () => ({ getJourney: state.getJourney }));
vi.mock("../../../../../lib/knowledge", () => ({ getKnowledgeBundle: state.getKnowledgeBundle }));
vi.mock("../../../../../lib/replan", () => ({ rescheduleDays: state.rescheduleDays }));
vi.mock("../../../../../lib/notifications", () => ({
  syncJourneyNotifications: async () => undefined,
}));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { POST } = await import("./route");

const JOURNEY = "00000000-0000-4000-8000-0000000000c1";
const AARTI = "d0000000-0000-4000-8000-00000000f009";
const DAWN = "d0000000-0000-4000-8000-00000000f007";

const detail = {
  journey: {
    id: JOURNEY,
    title: null,
    startDate: "2026-10-12",
    endDate: "2026-10-13",
    timezone: "Asia/Kolkata",
    dayStartTime: "06:00",
    dayEndTime: "21:00",
    pace: "balanced",
    status: "upcoming",
    destinationId: "d1",
    knowledgeCheckedAt: null,
  },
  items: [
    {
      id: "i1",
      day_index: 1,
      sort_order: 0,
      item_type: "experience",
      tier: "protected",
      experience_id: DAWN,
    },
  ],
  health: { journeyState: "comfortable", days: [] },
  labels: new Map(),
};

const bundle = {
  places: [{ id: "p1", visit_duration_likely_minutes: 90 }],
  experiences: [
    { id: AARTI, place_id: "p1", duration_likely_minutes: 45, duration_max_minutes: 60 },
    { id: DAWN, place_id: "p1", duration_likely_minutes: 60 },
  ],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const request = (body: unknown) =>
  new Request(`https://mandhira.test/api/journeys/${JOURNEY}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase({
    user: SIGNED_IN,
    tables: { journey_items: { data: { id: "new-item" }, error: null } },
  });
  state.client = fake.client;
  state.getJourney.mockReset().mockResolvedValue(detail);
  state.getKnowledgeBundle.mockReset().mockResolvedValue(bundle);
  state.rescheduleDays.mockReset().mockResolvedValue(detail);
});

const inserted = () => fake.calls.find((call) => call.method === "insert")?.args[0];

describe("POST /api/journeys/:id/items", () => {
  it("asks a guest to sign in", async () => {
    state.client = fakeSupabase({ user: null }).client;
    expect((await POST(request({ experienceId: AARTI }))).status).toBe(401);
  });

  it("refuses a fixed item without its time", async () => {
    const response = await POST(request({ experienceId: AARTI, tier: "fixed" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.fixedStartTime).toBeTruthy();
  });

  it("refuses an experience that is not published for this destination", async () => {
    const response = await POST(
      request({ experienceId: "d0000000-0000-4000-8000-00000000ffff", dayIndex: 0 }),
    );

    expect(response.status).toBe(404);
    expect(inserted()).toBeUndefined();
  });

  it("refuses a day the journey does not have", async () => {
    expect((await POST(request({ experienceId: AARTI, dayIndex: 5 }))).status).toBe(400);
  });

  it("refuses to add the same experience twice", async () => {
    expect((await POST(request({ experienceId: DAWN, dayIndex: 0 }))).status).toBe(409);
  });

  it("adds as IMPORTANT by default, then puts that day back on the clock", async () => {
    const response = await POST(request({ experienceId: AARTI, dayIndex: 1 }));

    expect(response.status).toBe(200);
    expect(inserted()).toMatchObject({
      journey_id: JOURNEY,
      day_index: 1,
      sort_order: 1,
      item_type: "experience",
      tier: "important",
      experience_id: AARTI,
      place_id: "p1",
      duration_likely_minutes: 45,
      fixed_start_at: null,
    });
    expect(state.rescheduleDays).toHaveBeenCalledWith(fake.client, JOURNEY, [1]);

    const { data } = await response.json();
    expect(data.itemId).toBe("new-item");
    expect(data.health).toEqual(detail.health);
  });

  it("anchors a fixed item at its time in the journey's timezone", async () => {
    await POST(
      request({ experienceId: AARTI, dayIndex: 0, tier: "fixed", fixedStartTime: "18:30" }),
    );

    const row = inserted() as { fixed_start_at: string; fixed_end_at: string };
    expect(Date.parse(row.fixed_start_at)).toBe(Date.parse("2026-10-12T18:30:00+05:30"));
    expect(Date.parse(row.fixed_end_at)).toBe(Date.parse("2026-10-12T19:15:00+05:30"));
  });
});
