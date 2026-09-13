import type { JourneyItem } from "@mandhira/journey-engine";
import type { RoutingProvider } from "@mandhira/providers";
import { describe, expect, it, vi } from "vitest";

import { ensureTravelEstimates, legsOf, planWithTravel } from "./travel";

const NOW = new Date("2026-09-13T06:00:00Z");

type Row = Record<string, unknown>;

/** Just enough of the Supabase query builder for the two reads and one upsert under test. */
function fakeClient(tables: { places: Row[]; estimates: Row[] }) {
  const upserts: Row[][] = [];

  const query = (rows: Row[]) => {
    let result = rows;
    const builder = {
      select: () => builder,
      in: (column: string, values: string[]) => {
        result = result.filter((row) => values.includes(row[column] as string));
        return builder;
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: result, error: null }),
    };
    return builder;
  };

  const client = {
    from: (table: string) => ({
      ...query(table === "v_published_places" ? tables.places : tables.estimates),
      upsert: async (rows: Row[]) => {
        upserts.push(rows);
        return { error: null };
      },
    }),
  };

  return { client: client as never, upserts };
}

const router = (source: "routed" | "estimated" = "estimated"): RoutingProvider => ({
  name: "fake",
  estimate: vi.fn(async () => ({
    distanceM: 1234.4,
    durationSeconds: 600.6,
    source,
    provider: "fake",
  })),
});

const place = (id: string, latitude: number | null = 25.3) => ({ id, latitude, longitude: 83.0 });

const item = (id: string, day: number, order: number, placeId: string | null): JourneyItem => ({
  id,
  day_index: day,
  sort_order: order,
  item_type: "experience",
  tier: "important",
  place_id: placeId,
});

describe("legsOf", () => {
  it("returns each day's consecutive place legs, in plan order, without repeats", () => {
    const legs = legsOf([
      item("b", 0, 1, "p2"),
      item("a", 0, 0, "p1"),
      item("c", 0, 2, "p2"),
      item("d", 0, 3, "p3"),
      item("e", 1, 0, "p1"),
      item("f", 1, 1, null),
      item("g", 1, 2, "p2"),
    ]);

    expect(legs).toEqual([
      { from: "p1", to: "p2" },
      { from: "p2", to: "p3" },
    ]);
  });
});

describe("ensureTravelEstimates", () => {
  it("routes every missing leg in both modes and records where the number came from", async () => {
    const { client, upserts } = fakeClient({ places: [place("p1"), place("p2")], estimates: [] });
    const routing = router("estimated");

    const result = await ensureTravelEstimates([{ from: "p1", to: "p2" }], {
      client,
      router: routing,
      now: NOW,
    });

    expect(result).toEqual({ computed: 2, deferred: 0 });
    expect(routing.estimate).toHaveBeenCalledTimes(2);
    expect(upserts[0]).toEqual([
      expect.objectContaining({
        from_place_id: "p1",
        to_place_id: "p2",
        mode: "vehicle",
        distance_m: 1234,
        duration_seconds: 601,
        provider: "fake:estimated",
      }),
      expect.objectContaining({ mode: "walk" }),
    ]);
  });

  it("leaves a fresh cached leg alone and recomputes a stale one", async () => {
    const { client, upserts } = fakeClient({
      places: [place("p1"), place("p2")],
      estimates: [
        {
          from_place_id: "p1",
          to_place_id: "p2",
          mode: "vehicle",
          computed_at: "2026-09-10T00:00:00Z",
        },
        {
          from_place_id: "p1",
          to_place_id: "p2",
          mode: "walk",
          computed_at: "2026-06-01T00:00:00Z",
        },
      ],
    });

    const result = await ensureTravelEstimates([{ from: "p1", to: "p2" }], {
      client,
      router: router(),
      now: NOW,
    });

    expect(result.computed).toBe(1);
    expect(upserts[0]).toEqual([expect.objectContaining({ mode: "walk" })]);
  });

  it("never routes to a place that is unpublished or has no coordinates", async () => {
    const { client, upserts } = fakeClient({
      places: [place("p1"), place("p2", null)],
      estimates: [],
    });
    const routing = router();

    const result = await ensureTravelEstimates(
      [
        { from: "p1", to: "p2" },
        { from: "p1", to: "hidden" },
      ],
      { client, router: routing, now: NOW },
    );

    expect(result.computed).toBe(0);
    expect(routing.estimate).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("does nothing at all for a plan with no legs", async () => {
    await expect(ensureTravelEstimates([])).resolves.toEqual({ computed: 0, deferred: 0 });
  });
});

describe("planWithTravel", () => {
  const bundle = {
    places: [],
    experiences: [],
    availability_rules: [],
    routes: [],
    transport_connections: [],
  };
  const plan = () => ({ items: [item("a", 0, 0, "p1"), item("b", 0, 1, "p2")] });

  it("plans again once travel has been routed, and stops when nothing new was routed", async () => {
    const load = vi.fn(async () => bundle);
    const ensure = vi
      .fn()
      .mockResolvedValueOnce({ computed: 2, deferred: 0 })
      .mockResolvedValueOnce({ computed: 0, deferred: 0 });

    await planWithTravel({ load, plan, ensure });

    expect(load).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it("keeps the plan when routing is unavailable", async () => {
    const load = vi.fn(async () => bundle);
    const ensure = vi.fn().mockRejectedValue(new Error("upstream down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { result } = await planWithTravel({ load, plan, ensure });

    expect(result.items).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
