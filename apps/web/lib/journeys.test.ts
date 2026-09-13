import { describe, expect, it, vi } from "vitest";

import { DataUnavailableError } from "./data-error";
import { getJourney, listJourneys } from "./journeys";

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));

type Result = { data: unknown; error: { code: string; message: string } | null };
type Client = Parameters<typeof getJourney>[0];

/** A query builder that accepts any chain and resolves to the result given for its table. */
function fakeClient(results: Record<string, Result>): Client {
  return {
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      const chain: object = new Proxy(
        {},
        {
          get: (_, prop) =>
            prop === "then"
              ? (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
                  Promise.resolve(result).then(resolve, reject)
              : () => chain,
        },
      );
      return chain;
    },
  } as unknown as Client;
}

const outage = { code: "08006", message: "connection terminated" };

describe("getJourney", () => {
  it("returns null when the journey genuinely is not there", async () => {
    const client = fakeClient({ journeys: { data: null, error: null } });
    await expect(getJourney(client, "j1", "en")).resolves.toBeNull();
  });

  it("throws rather than reporting a failed lookup as not found", async () => {
    const client = fakeClient({ journeys: { data: null, error: outage } });
    await expect(getJourney(client, "j1", "en")).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("throws when the journey exists but its items could not be read", async () => {
    const client = fakeClient({
      journeys: { data: { id: "j1", status: "draft", pace: "balanced" }, error: null },
      journey_destinations: { data: null, error: null },
      journey_items: { data: null, error: outage },
    });

    await expect(getJourney(client, "j1", "en")).rejects.toBeInstanceOf(DataUnavailableError);
  });
});

describe("listJourneys", () => {
  it("returns [] when the traveler has no journeys", async () => {
    await expect(
      listJourneys(fakeClient({ journeys: { data: [], error: null } })),
    ).resolves.toEqual([]);
  });

  it("throws instead of showing an empty list when the read did not complete", async () => {
    await expect(
      listJourneys(fakeClient({ journeys: { data: null, error: outage } })),
    ).rejects.toBeInstanceOf(DataUnavailableError);
  });
});
