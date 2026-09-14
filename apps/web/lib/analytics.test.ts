import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushAnalytics, resetAnalyticsForTests, track } from "./analytics";

function sentBatches(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string).events as unknown[],
  );
}

describe("track", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    resetAnalyticsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends events together, a few seconds after the last one", async () => {
    track("live_opened", { health_state: "tight" }, { journeyId: "j" });
    track("live_action", { action: "done" });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/analytics");
    expect(sentBatches(fetchMock)[0]).toEqual([
      {
        name: "live_opened",
        properties: { health_state: "tight" },
        journeyId: "j",
        isOffline: false,
      },
      { name: "live_action", properties: { action: "done" }, isOffline: false },
    ]);
  });

  it("keeps events while offline, marked offline, and sends them when back", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    track("offline_render", { snapshot_age_minutes: 40 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await flushAnalytics();

    expect(sentBatches(fetchMock)[0]).toEqual([
      { name: "offline_render", properties: { snapshot_age_minutes: 40 }, isOffline: true },
    ]);
  });

  it("splits a long queue into the batches the route accepts", async () => {
    for (let i = 0; i < 120; i++) track("live_action", { action: "done" });
    await flushAnalytics();

    expect(sentBatches(fetchMock).map((batch) => batch.length)).toEqual([50, 50, 20]);
  });

  it("never lets a failed send reach the screen", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    track("journey_saved", { day_count: 2 });

    await expect(flushAnalytics()).resolves.toBeUndefined();
  });
});
