import { describe, expect, it, vi } from "vitest";

import { SYNC_INTERVAL_MS, watchJourneyVersion } from "./journey-sync";

/** A hand-driven clock: `tick()` runs whatever is scheduled, as the timer would. */
function manualClock() {
  let pending: (() => void) | null = null;
  const schedule = vi.fn((callback: () => void, _ms: number) => {
    pending = callback;
    return callback;
  });
  const cancel = vi.fn(() => {
    pending = null;
  });
  const tick = async () => {
    const run = pending;
    pending = null;
    run?.();
    // Let the check's promise chain settle and the next tick be scheduled.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { schedule, cancel, tick };
}

describe("watchJourneyVersion", () => {
  it("checks every ten seconds and refreshes once when another device changed the journey", async () => {
    const clock = manualClock();
    const versions = ["v1", "v2", "v2"];
    const onChange = vi.fn();

    watchJourneyVersion({
      initialVersion: "v1",
      fetchVersion: async () => versions.shift() ?? "v2",
      onChange,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    expect(clock.schedule).toHaveBeenLastCalledWith(expect.any(Function), SYNC_INTERVAL_MS);

    await clock.tick();
    expect(onChange).not.toHaveBeenCalled();

    await clock.tick();
    await clock.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("v2");
  });

  it("asks nothing while the tab is hidden or offline", async () => {
    const clock = manualClock();
    const fetchVersion = vi.fn(async () => "v2");

    watchJourneyVersion({
      initialVersion: "v1",
      fetchVersion,
      onChange: vi.fn(),
      isActive: () => false,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    await clock.tick();
    await clock.tick();
    expect(fetchVersion).not.toHaveBeenCalled();
  });

  it("keeps watching after a failed or refused check", async () => {
    const clock = manualClock();
    const onChange = vi.fn();
    const fetchVersion = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(null)
      .mockResolvedValue("v2");

    watchJourneyVersion({
      initialVersion: "v1",
      fetchVersion,
      onChange,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    await clock.tick();
    await clock.tick();
    await clock.tick();
    expect(onChange).toHaveBeenCalledWith("v2");
  });

  it("stops cleanly, and never runs two checks at once", async () => {
    const clock = manualClock();
    let release: (value: string) => void = () => undefined;
    const fetchVersion = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const onChange = vi.fn();

    const watcher = watchJourneyVersion({
      initialVersion: "v1",
      fetchVersion,
      onChange,
      schedule: clock.schedule,
      cancel: clock.cancel,
    });

    void watcher.check();
    void watcher.check();
    expect(fetchVersion).toHaveBeenCalledTimes(1);

    watcher.stop();
    release("v2");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();
    expect(clock.cancel).toHaveBeenCalled();
  });
});
