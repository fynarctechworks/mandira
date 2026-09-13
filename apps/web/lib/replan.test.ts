import type { KnowledgeBundle } from "@mandhira/journey-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../test/fake-supabase";
import type { StoredItem } from "./journey-types";
import { rescheduleDays } from "./replan";

const state = vi.hoisted(() => ({ getJourney: vi.fn() }));

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));
vi.mock("./journeys", async () => {
  const types = await import("./journey-types");
  return { getJourney: state.getJourney, toEngineJourney: types.toEngineJourney };
});
vi.mock("./changes", () => ({ travelersFor: async () => [] }));
vi.mock("./knowledge", () => ({ getKnowledgeBundle: async () => BUNDLE }));
vi.mock("./travel", () => ({
  planWithTravel: async (input: {
    load: () => Promise<KnowledgeBundle>;
    plan: (knowledge: KnowledgeBundle) => unknown;
  }) => {
    const knowledge = await input.load();
    return { result: input.plan(knowledge), knowledge };
  },
}));

const BUNDLE: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const journey = {
  id: "j1",
  title: null,
  startDate: "2026-10-12",
  endDate: "2026-10-12",
  timezone: "Asia/Kolkata",
  dayStartTime: "06:00",
  dayEndTime: "21:00",
  pace: "balanced" as const,
  status: "upcoming" as const,
  destinationId: "d1",
  knowledgeCheckedAt: null,
};

const item = (over: Partial<StoredItem> & { id: string }): StoredItem => ({
  day_index: 0,
  sort_order: 0,
  item_type: "free_time",
  tier: "optional",
  duration_likely_minutes: 60,
  buffer_minutes: 0,
  planned_start_at: null,
  planned_end_at: null,
  status: "planned",
  actual_start_at: null,
  actual_end_at: null,
  ...over,
});

type Client = Parameters<typeof rescheduleDays>[0];

const detailOf = (items: StoredItem[]) => ({
  journey,
  items,
  health: { journeyState: "comfortable", days: [] },
  labels: new Map(),
});

beforeEach(() => state.getJourney.mockReset());

describe("rescheduleDays", () => {
  it("writes the new times of what moved, and leaves what already happened alone", async () => {
    const items = [
      item({ id: "first", sort_order: 0 }),
      item({ id: "done", sort_order: 1, status: "done" }),
    ];
    state.getJourney.mockResolvedValue(detailOf(items));
    const fake = fakeSupabase({ tables: { journey_items: { data: null, error: null } } });

    await rescheduleDays(fake.client as unknown as Client, "j1", [0]);

    const updates = fake.calls.filter((call) => call.method === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.args[0]).toEqual({
      planned_start_at: expect.any(String),
      planned_end_at: expect.any(String),
    });
    expect(fake.calls).toContainEqual({
      table: "journey_items",
      method: "eq",
      args: ["id", "first"],
    });
    expect(Date.parse((updates[0]!.args[0] as { planned_start_at: string }).planned_start_at)).toBe(
      Date.parse("2026-10-12T06:00:00+05:30"),
    );
  });

  it("writes nothing when every time is already right, whatever offset it was stored with", async () => {
    const items = [
      item({
        id: "first",
        planned_start_at: "2026-10-12T00:30:00+00:00",
        planned_end_at: "2026-10-12T01:30:00+00:00",
      }),
    ];
    state.getJourney.mockResolvedValue(detailOf(items));
    const fake = fakeSupabase({});

    const detail = await rescheduleDays(fake.client as unknown as Client, "j1", "all");

    expect(fake.calls.some((call) => call.method === "update")).toBe(false);
    expect(detail?.items).toEqual(items);
    expect(state.getJourney).toHaveBeenCalledTimes(1);
  });

  it("returns null for a journey the traveler cannot see", async () => {
    state.getJourney.mockResolvedValue(null);
    await expect(
      rescheduleDays(fakeSupabase({}).client as unknown as Client, "j9", "all"),
    ).resolves.toBeNull();
  });
});
