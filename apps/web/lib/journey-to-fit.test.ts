import { describe, expect, it } from "vitest";

import { fakeSupabase } from "../test/fake-supabase";
import { journeyToFit } from "./journeys";

const row = (id: string, status: string, start: string, end: string) => ({
  id,
  title: id,
  start_date: start,
  end_date: end,
  timezone: "Asia/Kolkata",
  day_start_time: "05:30:00",
  day_end_time: "21:00:00",
  pace: "balanced",
  status,
  knowledge_checked_at: null,
});

describe("journeyToFit", () => {
  it("ranks against the journey under way, at the destination it is planned against", async () => {
    const { client } = fakeSupabase({
      tables: {
        journeys: {
          data: [
            row("ahead", "upcoming", "2026-10-12", "2026-10-13"),
            row("now", "active", "2026-09-12", "2026-09-13"),
          ],
          error: null,
        },
        journey_destinations: {
          data: [
            { journey_id: "now", destination_id: "d-first", sort_order: 0 },
            { journey_id: "now", destination_id: "d-second", sort_order: 1 },
            { journey_id: "ahead", destination_id: "d-other", sort_order: 0 },
          ],
          error: null,
        },
      },
    });

    expect(await journeyToFit(client as never, "2026-09-13")).toEqual({
      id: "now",
      destinationId: "d-first",
      dates: ["2026-09-12", "2026-09-13"],
    });
  });

  it("is null for a traveler with nothing ahead", async () => {
    const { client } = fakeSupabase({
      tables: {
        journeys: { data: [row("done", "completed", "2026-01-01", "2026-01-02")], error: null },
      },
    });

    expect(await journeyToFit(client as never, "2026-09-13")).toBeNull();
  });
});
