import { describe, expect, it, vi } from "vitest";
import { createHaversineRouter, haversineMetres } from "./haversine";
import { createRoutingChain } from "./index";
import { createOpenRouteServiceRouter } from "./openrouteservice";
import type { LatLng, RoutingProvider } from "./types";

/**
 * Two places about 2.2 km apart in the Deccan, which is the kind of distance this actually
 * gets asked about — a temple and the gate you park at, not two cities.
 */
const TEMPLE: LatLng = { latitude: 17.385, longitude: 78.4867 };
const GATE: LatLng = { latitude: 17.4, longitude: 78.5 };

describe("haversineMetres", () => {
  it("is zero for a point against itself", () => {
    expect(haversineMetres(TEMPLE, TEMPLE)).toBe(0);
  });

  it("is symmetric", () => {
    expect(haversineMetres(TEMPLE, GATE)).toBeCloseTo(haversineMetres(GATE, TEMPLE), 6);
  });

  it("measures a known separation", () => {
    // One degree of latitude is ~111 km everywhere.
    const north = { latitude: TEMPLE.latitude + 1, longitude: TEMPLE.longitude };
    expect(haversineMetres(TEMPLE, north)).toBeGreaterThan(110_000);
    expect(haversineMetres(TEMPLE, north)).toBeLessThan(112_000);
  });
});

describe("the straight-line fallback", () => {
  const router = createHaversineRouter();

  it("labels every answer as an estimate, never as routed", async () => {
    const result = await router.estimate(TEMPLE, GATE, "walk");
    expect(result?.source).toBe("estimated");
  });

  it("never declines — it is the bottom of the chain", async () => {
    for (const mode of ["walk", "car", "bus", "train", "auto_rickshaw", "ferry"] as const) {
      expect(await router.estimate(TEMPLE, GATE, mode)).not.toBeNull();
    }
  });

  it("guesses long rather than short", async () => {
    // The detour factor is the whole reason this is usable: a road is reliably longer than
    // the straight line, and arriving early costs a traveler a sit-down while arriving
    // late costs them a darshan that happens once that day.
    const straight = haversineMetres(TEMPLE, GATE);
    const walk = await router.estimate(TEMPLE, GATE, "walk");

    expect(walk!.distanceM).toBeGreaterThan(straight);
  });

  it("never reports a transition as free", async () => {
    // Two points in the same courtyard. Zero seconds would tell the engine that moving
    // between them costs nothing, and nothing about walking barefoot across a temple
    // complex costs nothing.
    const nextDoor = { latitude: TEMPLE.latitude + 0.00001, longitude: TEMPLE.longitude };
    const result = await router.estimate(TEMPLE, nextDoor, "walk");

    expect(result!.durationSeconds).toBeGreaterThanOrEqual(60);
  });

  it("takes longer on foot than by car over the same ground", async () => {
    const walk = await router.estimate(TEMPLE, GATE, "walk");
    const car = await router.estimate(TEMPLE, GATE, "car");

    expect(walk!.durationSeconds).toBeGreaterThan(car!.durationSeconds);
  });
});

describe("the OpenRouteService adapter", () => {
  const ok = (distance: number, duration: number) =>
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      void _url;
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ routes: [{ summary: { distance, duration } }] }), {
          status: 200,
        }),
      );
    });

  it("declines without a key, and does not call out", async () => {
    const fetchImpl = ok(1000, 600);
    const router = createOpenRouteServiceRouter({ apiKey: undefined, fetchImpl });

    expect(await router.estimate(TEMPLE, GATE, "car")).toBeNull();
    // The state until ACCT-03 lands. Calling anyway would burn a request to be told no.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks a real route as routed", async () => {
    const router = createOpenRouteServiceRouter({ apiKey: "k", fetchImpl: ok(2431, 512) });
    const result = await router.estimate(TEMPLE, GATE, "car");

    expect(result).toEqual({
      distanceM: 2431,
      durationSeconds: 512,
      source: "routed",
      provider: "openrouteservice",
    });
  });

  it("sends longitude before latitude, which is ORS's order and nobody else's", async () => {
    const fetchImpl = ok(1000, 600);
    const router = createOpenRouteServiceRouter({ apiKey: "k", fetchImpl });
    await router.estimate(TEMPLE, GATE, "car");

    // A swap here returns a confident answer for somewhere entirely different, which is
    // worse than no answer and impossible to spot on screen.
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.coordinates).toEqual([
      [78.4867, 17.385],
      [78.5, 17.4],
    ]);
  });

  it("slows the driving profile down for a bus rather than reporting car speed", async () => {
    const router = createOpenRouteServiceRouter({ apiKey: "k", fetchImpl: ok(2000, 400) });

    const car = await router.estimate(TEMPLE, GATE, "car");
    const bus = await router.estimate(TEMPLE, GATE, "bus");

    // Same roads, same geometry — a bus stops.
    expect(bus!.distanceM).toBe(car!.distanceM);
    expect(bus!.durationSeconds).toBeGreaterThan(car!.durationSeconds);
  });

  it("declines for modes it does not model, instead of routing them by road", async () => {
    const fetchImpl = ok(1000, 600);
    const router = createOpenRouteServiceRouter({ apiKey: "k", fetchImpl });

    // A road route between two railway stations is not a train journey. It is a plausible
    // wrong number, which is worse than none — `transport_connections` holds the timetable.
    expect(await router.estimate(TEMPLE, GATE, "train")).toBeNull();
    expect(await router.estimate(TEMPLE, GATE, "ferry")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("declines on an upstream failure rather than throwing", async () => {
    const router = createOpenRouteServiceRouter({
      apiKey: "k",
      fetchImpl: vi.fn(async () => Promise.resolve(new Response("nope", { status: 503 }))),
    });

    expect(await router.estimate(TEMPLE, GATE, "car")).toBeNull();
  });

  it("declines when the quota is spent", async () => {
    const router = createOpenRouteServiceRouter({
      apiKey: "k",
      fetchImpl: vi.fn(async () => Promise.resolve(new Response("{}", { status: 429 }))),
    });

    expect(await router.estimate(TEMPLE, GATE, "car")).toBeNull();
  });

  it("declines on a malformed answer rather than trusting its shape", async () => {
    const router = createOpenRouteServiceRouter({
      apiKey: "k",
      fetchImpl: vi.fn(async () =>
        Promise.resolve(new Response(JSON.stringify({ routes: [] }), { status: 200 })),
      ),
    });

    expect(await router.estimate(TEMPLE, GATE, "car")).toBeNull();
  });

  it("declines when the network throws", async () => {
    const router = createOpenRouteServiceRouter({
      apiKey: "k",
      fetchImpl: vi.fn(() => Promise.reject(new Error("offline"))),
    });

    // The traveler is on a hill with one bar. This is a normal Tuesday, not an exception.
    expect(await router.estimate(TEMPLE, GATE, "car")).toBeNull();
  });
});

describe("the routing chain", () => {
  const declines: RoutingProvider = { name: "declines", estimate: async () => null };

  it("falls through to the estimate when the router above declines", async () => {
    const chain = createRoutingChain([declines, createHaversineRouter()]);
    const result = await chain.estimate(TEMPLE, GATE, "walk");

    expect(result?.source).toBe("estimated");
  });

  it("stops at the first real answer", async () => {
    const second = vi.fn(async () => null);
    const chain = createRoutingChain([
      createOpenRouteServiceRouter({
        apiKey: "k",
        fetchImpl: vi.fn(async () =>
          Promise.resolve(
            new Response(JSON.stringify({ routes: [{ summary: { distance: 1, duration: 90 } }] }), {
              status: 200,
            }),
          ),
        ),
      }),
      { name: "second", estimate: second },
    ]);

    expect((await chain.estimate(TEMPLE, GATE, "car"))?.source).toBe("routed");
    expect(second).not.toHaveBeenCalled();
  });

  it("as configured, always answers — the engine can always schedule", async () => {
    // The guarantee that lets `scheduleDay` treat travel time as known. What varies is
    // whether it is routed or estimated, never whether there is a number at all.
    const chain = createRoutingChain([
      createOpenRouteServiceRouter({ apiKey: undefined }),
      createHaversineRouter(),
    ]);

    expect(await chain.estimate(TEMPLE, GATE, "car")).not.toBeNull();
  });
});
