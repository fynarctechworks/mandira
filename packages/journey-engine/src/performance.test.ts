import { describe, expect, it } from "vitest";

import { evaluateChange } from "./change";
import { computeHealth } from "./health";
import { scheduleDay } from "./schedule";
import type { Journey, JourneyItem, KnowledgeBundle, TravelEstimate } from "./types";

/*
 * PRD-PLAN-009: health recomputes within 500 ms for a 7-day, 60-item journey.
 *
 * Measured as the whole recompute a traveler waits for — scheduling every day, then Journey
 * Health — at the 95th percentile of repeated runs, on a journey with travel estimates and
 * availability rules so the expensive paths are exercised. The budget is the PRD's; a CI
 * machine slower than a mid-range phone would still pass it by a wide margin.
 */

const HEALTH_BUDGET_MS = 500;
const RUNS = 20;

function largeJourney(): { journey: Journey; items: JourneyItem[]; knowledge: KnowledgeBundle } {
  const journey: Journey = {
    id: "perf",
    start_date: "2026-11-02",
    end_date: "2026-11-08",
    timezone: "Asia/Kolkata",
    day_start_time: "05:30",
    day_end_time: "21:30",
  };

  const items: JourneyItem[] = [];
  const estimates: TravelEstimate[] = [];

  for (let n = 0; n < 60; n += 1) {
    const day = Math.floor(n / 9) % 7;
    items.push({
      id: `i${n}`,
      day_index: day,
      sort_order: n,
      item_type: "experience",
      tier: (["protected", "important", "optional"] as const)[n % 3],
      experience_id: `e${n}`,
      place_id: `p${n}`,
      duration_likely_minutes: 45 + (n % 4) * 15,
      buffer_minutes: 15,
      travel_mode: "walk",
    });

    if (n > 0) {
      for (const mode of ["walk", "vehicle"] as const) {
        estimates.push({
          from_place_id: `p${n - 1}`,
          to_place_id: `p${n}`,
          mode,
          distance_m: 800 + n * 10,
          duration_seconds: 600 + n * 5,
        });
      }
    }
  }

  return {
    journey,
    items,
    knowledge: {
      places: items.map((i) => ({ id: i.place_id!, step_free: "partial" as const })),
      experiences: items.map((i) => ({ id: i.experience_id!, place_id: i.place_id! })),
      availability_rules: items.map((i) => ({
        id: `r-${i.id}`,
        experience_id: i.experience_id!,
        kind: "daily_fixed_times" as const,
        daily_times: [
          { start: "06:00", end: "12:00" },
          { start: "16:00", end: "21:00" },
        ],
        priority: 1,
      })),
      routes: [],
      transport_connections: [],
      travel_estimates: estimates,
    },
  };
}

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

describe("performance", () => {
  const { journey, items, knowledge } = largeJourney();
  const travelers = [{ id: "t1", mobility: "limited_walking" as const, age_band: "senior" as const }];

  const recompute = () => {
    const scheduled = [0, 1, 2, 3, 4, 5, 6].flatMap(
      (dayIndex) => scheduleDay({ journey, dayIndex, items, knowledge, travelers }).items,
    );
    return computeHealth({ journey, items: scheduled, knowledge, travelers });
  };

  it(`recomputes a 7-day, 60-item journey's health within ${HEALTH_BUDGET_MS} ms (p95)`, () => {
    expect(items).toHaveLength(60);
    expect(recompute().days).toHaveLength(7);

    const samples = Array.from({ length: RUNS }, () => {
      const started = performance.now();
      recompute();
      return performance.now() - started;
    });

    expect(percentile95(samples)).toBeLessThan(HEALTH_BUDGET_MS);
  });

  it("evaluates a Change Card on that journey within the same budget", () => {
    const samples = Array.from({ length: 5 }, () => {
      const started = performance.now();
      evaluateChange({
        journey,
        items,
        knowledge,
        travelers,
        trigger: { kind: "user_late", dayIndex: 0, itemId: "i0", deltaMinutes: 240 },
      });
      return performance.now() - started;
    });

    expect(percentile95(samples)).toBeLessThan(HEALTH_BUDGET_MS);
  });
});
