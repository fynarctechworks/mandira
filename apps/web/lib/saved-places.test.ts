import { describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../test/fake-supabase";
import { DataUnavailableError } from "./data-error";
import { isPlaceSaved, listSavedPlaces, savePlace } from "./saved-places";

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));

type Client = Parameters<typeof listSavedPlaces>[0];
const as = (fake: ReturnType<typeof fakeSupabase>) => fake.client as unknown as Client;

describe("listSavedPlaces", () => {
  it("lists published places newest first, and quietly drops one no longer published", async () => {
    const fake = fakeSupabase({
      tables: {
        saved_places: {
          data: [
            { place_id: "p2", created_at: "2026-09-12" },
            { place_id: "gone", created_at: "2026-09-11" },
            { place_id: "p1", created_at: "2026-09-10" },
          ],
          error: null,
        },
        v_published_places: {
          data: [
            {
              id: "p1",
              slug: "hill-temple",
              name_i18n: { en: "Hill Temple" },
              destination_id: "d1",
            },
            {
              id: "p2",
              slug: "ghat",
              name_i18n: { en: "River Ghat", te: "నది ఘాట్" },
              destination_id: "d1",
            },
          ],
          error: null,
        },
        v_published_destinations: {
          data: [{ id: "d1", slug: "devagiri", name_i18n: { en: "Devagiri" } }],
          error: null,
        },
      },
    });

    await expect(listSavedPlaces(as(fake), SIGNED_IN.id, "te")).resolves.toEqual([
      {
        placeId: "p2",
        name: "నది ఘాట్",
        destinationName: "Devagiri",
        path: "/destinations/devagiri/places/ghat",
      },
      {
        placeId: "p1",
        name: "Hill Temple",
        destinationName: "Devagiri",
        path: "/destinations/devagiri/places/hill-temple",
      },
    ]);
  });

  it("throws instead of showing no saved places when the read did not complete", async () => {
    const fake = fakeSupabase({
      tables: { saved_places: { data: null, error: { message: "timeout" } } },
    });
    await expect(listSavedPlaces(as(fake), SIGNED_IN.id, "en")).rejects.toBeInstanceOf(
      DataUnavailableError,
    );
  });
});

describe("savePlace", () => {
  it("does not bookmark what is not published", async () => {
    const fake = fakeSupabase({ tables: { v_published_places: { data: null, error: null } } });

    await expect(savePlace(as(fake), SIGNED_IN.id, "p9")).resolves.toBe(false);
    expect(fake.calls.some((call) => call.table === "saved_places")).toBe(false);
  });
});

describe("isPlaceSaved", () => {
  it("is true only when the traveler's own row exists", async () => {
    const saved = fakeSupabase({
      tables: { saved_places: { data: { place_id: "p1" }, error: null } },
    });
    const unsaved = fakeSupabase({ tables: { saved_places: { data: null, error: null } } });

    await expect(isPlaceSaved(as(saved), SIGNED_IN.id, "p1")).resolves.toBe(true);
    await expect(isPlaceSaved(as(unsaved), SIGNED_IN.id, "p1")).resolves.toBe(false);
  });
});
