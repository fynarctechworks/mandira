import { afterEach, describe, expect, it, vi } from "vitest";

import { reminderDelay, scheduleLeaveByReminder } from "./leave-by-reminder";

const NOW = Date.parse("2026-10-12T03:00:00Z");
const LEAVE_BY = "2026-10-12T04:00:00Z";

describe("reminderDelay", () => {
  it("is null with nothing to leave for", () => {
    expect(reminderDelay(null, NOW)).toBeNull();
  });

  it("is null once the time to leave has passed", () => {
    expect(reminderDelay("2026-10-12T02:59:00Z", NOW)).toBeNull();
  });

  it("counts back the engine's lead from the leave-by time", () => {
    expect(reminderDelay(LEAVE_BY, NOW)).toBe(45 * 60_000);
  });

  it("is immediate when the screen opens inside the lead", () => {
    expect(reminderDelay("2026-10-12T03:10:00Z", NOW)).toBe(0);
  });
});

describe("scheduleLeaveByReminder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const schedule = (permission: NotificationPermission) => {
    const showNotification = vi.fn(async () => undefined);
    const cancel = scheduleLeaveByReminder({
      leaveByAt: LEAVE_BY,
      tag: "leave-by:j1",
      title: "Time to set off",
      body: "Leave by 9:30 AM for Evening Aarti.",
      nowMs: NOW,
      permission,
      ready: async () => ({ showNotification }),
    });
    return { showNotification, cancel };
  };

  it("shows one notification, tagged for the journey, when the lead begins", async () => {
    vi.useFakeTimers();
    const { showNotification } = schedule("granted");

    await vi.advanceTimersByTimeAsync(45 * 60_000 - 1);
    expect(showNotification).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(showNotification).toHaveBeenCalledWith("Time to set off", {
      body: "Leave by 9:30 AM for Evening Aarti.",
      tag: "leave-by:j1",
    });
  });

  it("does nothing without permission already granted", async () => {
    vi.useFakeTimers();
    const { showNotification } = schedule("default");

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("can be cancelled when the plan moves", async () => {
    vi.useFakeTimers();
    const { showNotification, cancel } = schedule("granted");

    cancel();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(showNotification).not.toHaveBeenCalled();
  });
});
