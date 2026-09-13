import { describe, expect, it } from "vitest";
import { everyLabel, percent, queueRows, type KnowledgeHealth } from "./health";

const queues: KnowledgeHealth["queues"] = {
  review: { open: 2, oldest_at: "2026-09-01T00:00:00Z" },
  verify: { open: 0, oldest_at: null },
  reverify: { open: 5, oldest_at: "2026-08-01T00:00:00Z" },
  conflicts: { open: 1, oldest_at: "2026-09-10T00:00:00Z" },
  reports: { open: 3, oldest_at: "2026-09-11T00:00:00Z" },
  // `sum()` over no rows is null in SQL, and must read as zero here.
  publish: { open: null, oldest_at: null },
  scheduled: { open: 1, next_at: "2026-09-14T09:00:00Z" },
};

describe("queueRows", () => {
  it("lists every queue with the screen that works it", () => {
    const rows = queueRows(queues);
    expect(rows.map((row) => row.href)).toEqual([
      "/review",
      "/verify",
      "/conflicts",
      "/publish",
      "/reports",
      "/freshness",
      "/publish#scheduled",
    ]);
  });

  it("reads a null count as zero", () => {
    expect(queueRows(queues).find((row) => row.key === "publish")?.open).toBe(0);
  });

  it("marks schedules as due rather than waiting", () => {
    const scheduled = queueRows(queues).find((row) => row.key === "scheduled");
    expect(scheduled).toMatchObject({ kind: "due", at: "2026-09-14T09:00:00Z", open: 1 });
  });
});

describe("percent", () => {
  it("rounds and survives an empty total", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("everyLabel", () => {
  it("names the cadences the jobs use", () => {
    expect(everyLabel(300)).toBe("every 5 minutes");
    expect(everyLabel(3600)).toBe("hourly");
    expect(everyLabel(86400)).toBe("daily");
    expect(everyLabel(172800)).toBe("every 2 days");
  });
});
