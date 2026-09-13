import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type QueryResult } from "../test/fake-supabase";
import type { StoredItem } from "./journey-types";

const state = vi.hoisted(() => ({
  getJourney: vi.fn(),
  service: null as unknown,
}));

vi.mock("./journeys", async () => ({
  getJourney: state.getJourney,
  toEngineJourney: (await import("./journey-types")).toEngineJourney,
}));
vi.mock("./knowledge", () => ({
  getKnowledgeBundle: async () => ({
    places: [],
    experiences: [],
    availability_rules: [],
    routes: [],
    transport_connections: [],
    travel_estimates: [],
  }),
}));
vi.mock("@mandhira/db/client/server", () => ({ createServiceRoleSupabase: () => state.service }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { render, syncJourneyNotifications } = await import("./notifications");

const USER = "u1";
const JOURNEY = "j1";

const item = (
  id: string,
  order: number,
  start: string,
  extra: Partial<StoredItem> = {},
): StoredItem =>
  ({
    id,
    day_index: 0,
    sort_order: order,
    item_type: "experience",
    tier: "important",
    place_id: `p-${id}`,
    experience_id: null,
    planned_start_at: start,
    buffer_minutes: 10,
    status: "planned",
    actual_start_at: null,
    actual_end_at: null,
    ...extra,
  }) as StoredItem;

function detail(items: StoredItem[]) {
  return {
    journey: {
      id: JOURNEY,
      title: "Test",
      startDate: "2099-01-10",
      endDate: "2099-01-10",
      timezone: "Asia/Kolkata",
      dayStartTime: "05:30",
      dayEndTime: "21:00",
      pace: "balanced",
      status: "upcoming",
      destinationId: "d1",
      knowledgeCheckedAt: null,
    },
    items,
    health: {},
    labels: new Map([["p-i2", "Hill Temple"]]),
  };
}

const traveler = () =>
  fakeSupabase({
    tables: {
      profiles: { data: { notification_prefs: {} }, error: null },
      notifications: { data: null, error: null },
    },
  });

function service(existing: unknown[]) {
  const fake = fakeSupabase({
    tables: {
      notifications: [
        { data: existing, error: null },
        { data: null, error: null },
      ] as QueryResult[],
    },
  });
  state.service = fake.client;
  return fake;
}

const inserted = (fake: ReturnType<typeof service>) =>
  fake.calls
    .filter((call) => call.method === "insert")
    .flatMap(
      (call) =>
        call.args[0] as {
          payload: { dedupeKey: string; params: Record<string, unknown> };
          scheduled_for: string;
        }[],
    );

const cancelledIds = (fake: ReturnType<typeof service>) =>
  fake.calls
    .filter((call) => call.method === "in" && call.args[0] === "id")
    .flatMap((call) => call.args[1] as string[]);

const plan = [item("i1", 0, "2099-01-10T01:00:00Z"), item("i2", 1, "2099-01-10T05:00:00Z")];

beforeEach(() => {
  state.getJourney.mockReset();
});

describe("syncJourneyNotifications", () => {
  it("queues the reminders a plan implies, naming where to go", async () => {
    state.getJourney.mockResolvedValue(detail(plan));
    const queue = service([]);

    const result = await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    const rows = inserted(queue);
    expect(rows.map((row) => row.payload.dedupeKey).sort()).toEqual(["leaveby:i2", "tomorrow:j1"]);
    expect(
      rows.find((row) => row.payload.dedupeKey === "leaveby:i2")?.payload.params,
    ).toMatchObject({
      place: "Hill Temple",
    });
    expect(result).toEqual({ scheduled: 2, cancelled: 0 });
  });

  it("leaves an unchanged queue exactly as it is", async () => {
    state.getJourney.mockResolvedValue(detail(plan));
    const first = service([]);
    await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    const existing = inserted(first).map((row, index) => ({
      id: `n${index}`,
      payload: row.payload,
      status: "scheduled",
      scheduled_for: row.scheduled_for,
    }));
    const second = service(existing);

    const result = await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    expect(result).toEqual({ scheduled: 0, cancelled: 0 });
    expect(second.calls.some((call) => call.method === "insert" || call.method === "update")).toBe(
      false,
    );
  });

  it("cancels a reminder whose item moved and queues the new time (PRD-NOTF-002)", async () => {
    state.getJourney.mockResolvedValue(detail(plan));
    const queue = service([
      {
        id: "old",
        payload: { dedupeKey: "leaveby:i2", params: { place: "Hill Temple" } },
        status: "scheduled",
        scheduled_for: "2099-01-10T02:00:00Z",
      },
    ]);

    const result = await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    expect(cancelledIds(queue)).toEqual(["old"]);
    expect(inserted(queue).map((row) => row.payload.dedupeKey)).toContain("leaveby:i2");
    expect(result.cancelled).toBe(1);
  });

  it("cancels the leave-by for something already done, and queues none", async () => {
    state.getJourney.mockResolvedValue(
      detail([plan[0]!, item("i2", 1, "2099-01-10T05:00:00Z", { status: "done" })]),
    );
    const queue = service([
      {
        id: "done-one",
        payload: { dedupeKey: "leaveby:i2", params: {} },
        status: "scheduled",
        scheduled_for: "2099-01-10T04:35:00Z",
      },
    ]);

    await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    expect(cancelledIds(queue)).toEqual(["done-one"]);
    expect(inserted(queue).map((row) => row.payload.dedupeKey)).not.toContain("leaveby:i2");
  });

  it("never re-sends a delivered reminder, and never touches what it did not derive", async () => {
    state.getJourney.mockResolvedValue(detail(plan));
    const queue = service([
      {
        id: "sent",
        payload: { dedupeKey: "tomorrow:j1" },
        status: "sent",
        scheduled_for: "2099-01-09T12:30:00Z",
      },
      {
        id: "card",
        payload: { dedupeKey: "change:abc" },
        status: "scheduled",
        scheduled_for: "2099-01-10T00:00:00Z",
      },
    ]);

    await syncJourneyNotifications(traveler().client as never, JOURNEY, USER, "en");

    expect(inserted(queue).map((row) => row.payload.dedupeKey)).toEqual(["leaveby:i2"]);
    expect(cancelledIds(queue)).toEqual([]);
  });
});

describe("render", () => {
  it("renders English exactly as before", () => {
    expect(render("notify.leave_by.body", { minutes: 15, place: "Hill Temple" }, "en")).toBe(
      "About 15 minutes to reach Hill Temple.",
    );
    expect(render("notify.prepare_deadline.body", { days: 60 }, "en")).toBe(
      "Booking opens 60 days before, and that is coming up.",
    );
    expect(render("notify.prepare_deadline.body", {}, "en")).toBe(
      "A booking on your list is coming up.",
    );
  });

  it("renders in the traveler's language, with a localised default place", () => {
    expect(render("notify.leave_by.title", {}, "te")).toBe("బయలుదేరే సమయం");
    expect(render("notify.leave_by.body", { minutes: 15 }, "hi")).toBe(
      "आपकी अगली जगह पहुँचने में लगभग 15 मिनट।",
    );
  });

  it("falls back to English for an unknown locale, and to nothing for a key it does not own", () => {
    expect(render("notify.leave_by.title", {}, "fr")).toBe("Time to head off");
    expect(render("health.state.broken", {}, "en")).toBe("");
    expect(render(undefined, {}, "en")).toBe("");
  });
});
