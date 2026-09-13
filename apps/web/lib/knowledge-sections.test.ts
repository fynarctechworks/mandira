import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type QueryResult } from "../test/fake-supabase";
import { DataUnavailableError } from "./data-error";
import { getDestinationPlacesPage, searchKnowledge } from "./knowledge";
import { webSupabase } from "./supabase";

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));

function useTables(tables: Record<string, QueryResult | QueryResult[]>) {
  const fake = fakeSupabase({ tables });
  vi.mocked(webSupabase).mockResolvedValue(fake.client as never);
  return fake;
}

const destination = {
  data: {
    id: "d1",
    slug: "devagiri",
    name_i18n: { en: "Devagiri" },
    region: null,
    overview_i18n: {},
  },
  error: null,
};

const place = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  name_i18n: { en: id },
  place_type: "temple",
  facility_subtype: null,
  summary_i18n: {},
  visit_duration_likely_minutes: 60,
  editorial_weight: 3,
  trust: {},
  accessibility: null,
  destination_id: "d1",
  ...extra,
});

beforeEach(() => {
  vi.mocked(webSupabase).mockReset();
});

describe("getDestinationPlacesPage", () => {
  it("pages twenty at a time and knows how many pages there are", async () => {
    const fake = useTables({
      v_published_destinations: destination,
      v_published_places: { data: [place("p21")], error: null, count: 45 },
    });

    const section = await getDestinationPlacesPage("devagiri", 2, "en");

    expect(section).toMatchObject({ total: 45, page: 2, pageCount: 3 });
    expect(section?.cards.map((card) => card.id)).toEqual(["p21"]);
    expect(fake.calls).toContainEqual({
      table: "v_published_places",
      method: "range",
      args: [20, 39],
    });
  });

  it("treats a page that is not a number as the first", async () => {
    const fake = useTables({
      v_published_destinations: destination,
      v_published_places: { data: [], error: null, count: 0 },
    });

    await expect(getDestinationPlacesPage("devagiri", Number.NaN, "en")).resolves.toMatchObject({
      page: 1,
      pageCount: 1,
    });
    expect(fake.calls).toContainEqual({
      table: "v_published_places",
      method: "range",
      args: [0, 19],
    });
  });

  it("is null for a destination that is not published", async () => {
    useTables({ v_published_destinations: { data: null, error: null } });
    await expect(getDestinationPlacesPage("nowhere", 1, "en")).resolves.toBeNull();
  });

  it("throws when the list could not be read, rather than showing an empty page", async () => {
    useTables({
      v_published_destinations: destination,
      v_published_places: { data: null, error: { message: "timeout" } },
    });
    await expect(getDestinationPlacesPage("devagiri", 1, "en")).rejects.toBeInstanceOf(
      DataUnavailableError,
    );
  });
});

describe("searchKnowledge's journey-aware filters", () => {
  const experience = (id: string, placeId: string) => ({
    id,
    slug: id,
    name_i18n: { en: id },
    experience_type: "aarti",
    significance_i18n: {},
    duration_likely_minutes: 45,
    advance_booking_required: false,
    advance_booking_opens_days_before: null,
    editorial_weight: 3,
    trust: {},
    accessibility: null,
    destination_id: "d1",
    place_id: placeId,
  });

  const rule = (experienceId: string, extra: Record<string, unknown>) => ({
    id: `r-${experienceId}`,
    experience_id: experienceId,
    daily_times: [{ start: "18:00", end: "19:00" }],
    weekly_pattern: null,
    date_start: null,
    date_end: null,
    calendar_dates: null,
    priority: 1,
    valid_from: null,
    valid_to: null,
    ...extra,
  });

  it("keeps only what runs, or is open, on the chosen date", async () => {
    useTables({
      v_published_experiences: {
        data: [experience("daily", "p1"), experience("another-day", "p1")],
        error: null,
      },
      v_published_places: [
        {
          data: [
            place("open-monday", { opening_schedule: { weekly: { mon: [["06:00", "20:00"]] } } }),
            place("closed-monday", { opening_schedule: { weekly: { tue: [["06:00", "20:00"]] } } }),
            place("no-hours", { opening_schedule: null }),
          ],
          error: null,
        },
        { data: [{ id: "p1", latitude: 18, longitude: 79, opening_schedule: null }], error: null },
      ],
      v_published_availability_rules: {
        data: [
          rule("daily", { kind: "daily_fixed_times" }),
          rule("another-day", { kind: "calendar_dates", calendar_dates: ["2026-10-13"] }),
        ],
        error: null,
      },
    });

    // 2026-10-12 is a Monday.
    const results = await searchKnowledge("", { availableOn: "2026-10-12" }, "en");

    expect(results.experiences.map((card) => card.id)).toEqual(["daily"]);
    expect(results.places.map((card) => card.id)).toEqual(["open-monday"]);
    expect(results.filtersApplied).toBe(true);
  });

  it("keeps only what is within walking distance of a place already in the journey", async () => {
    useTables({
      v_published_experiences: {
        data: [experience("close", "p-near"), experience("far", "p-far")],
        error: null,
      },
      v_published_places: [
        {
          data: [
            place("next-door", { latitude: 18.001, longitude: 79.001 }),
            place("unpinned", { latitude: null, longitude: null }),
          ],
          error: null,
        },
        {
          data: [
            { id: "p-near", latitude: 18.005, longitude: 79.0, opening_schedule: null },
            { id: "p-far", latitude: 18.5, longitude: 79.0, opening_schedule: null },
          ],
          error: null,
        },
        { data: [{ latitude: 18.0, longitude: 79.0 }], error: null },
      ],
      journey_items: { data: [{ place_id: "anchor" }], error: null },
    });

    const results = await searchKnowledge(
      "",
      { nearJourneyId: "00000000-0000-4000-8000-0000000000c1" },
      "en",
    );

    expect(results.experiences.map((card) => card.id)).toEqual(["close"]);
    expect(results.places.map((card) => card.id)).toEqual(["next-door"]);
  });

  it("filters a wider window than it shows, so matches past the first twenty are not lost", async () => {
    // Only the last ten run on the date — every one of them past a twenty-row read.
    const ids = Array.from({ length: 30 }, (_, n) => `x${n}`);
    const fake = useTables({
      v_published_experiences: { data: ids.map((id) => experience(id, "p1")), error: null },
      v_published_places: [
        { data: [], error: null },
        { data: [{ id: "p1", latitude: 18, longitude: 79, opening_schedule: null }], error: null },
      ],
      v_published_availability_rules: {
        data: ids.slice(20).map((id) => rule(id, { kind: "daily_fixed_times" })),
        error: null,
      },
    });

    const results = await searchKnowledge("", { availableOn: "2026-10-12" }, "en");

    expect(results.experiences.map((card) => card.id)).toEqual(ids.slice(20));
    expect(fake.calls).toContainEqual({
      table: "v_published_experiences",
      method: "limit",
      args: [200],
    });
  });

  it("still shows at most twenty once the filter has run", async () => {
    const ids = Array.from({ length: 30 }, (_, n) => `y${n}`);
    const fake = useTables({
      v_published_experiences: { data: ids.map((id) => experience(id, "p1")), error: null },
      v_published_places: [
        { data: [], error: null },
        { data: [{ id: "p1", latitude: 18, longitude: 79, opening_schedule: null }], error: null },
      ],
      v_published_availability_rules: {
        data: ids.map((id) => rule(id, { kind: "daily_fixed_times" })),
        error: null,
      },
    });

    const results = await searchKnowledge("", { availableOn: "2026-10-12" }, "en");

    expect(results.experiences).toHaveLength(20);
    expect(fake.calls.length).toBeGreaterThan(0);
  });
});
