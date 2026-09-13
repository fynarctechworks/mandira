import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataUnavailableError } from "./data-error";
import { getDestinationCards, getDestinationPage } from "./knowledge";
import { webSupabase } from "./supabase";

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));

type Result = { data: unknown; error: { code: string; message: string } | null };

/** A query builder that accepts any chain and resolves to the result given for its view. */
function useResults(results: Record<string, Result>) {
  const client = {
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
  };

  vi.mocked(webSupabase).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof webSupabase>>,
  );
}

const outage = { code: "PGRST301", message: "JWT expired" };

beforeEach(() => {
  vi.mocked(webSupabase).mockReset();
});

describe("getDestinationCards", () => {
  it("returns [] when nothing has been published", async () => {
    useResults({ v_published_destinations: { data: [], error: null } });
    await expect(getDestinationCards("en")).resolves.toEqual([]);
  });

  it("throws instead of claiming nothing has been published", async () => {
    useResults({ v_published_destinations: { data: null, error: outage } });
    await expect(getDestinationCards("en")).rejects.toBeInstanceOf(DataUnavailableError);
  });
});

describe("getDestinationPage", () => {
  it("returns null for a destination that is not published", async () => {
    useResults({ v_published_destinations: { data: null, error: null } });
    await expect(getDestinationPage("tirumala", "en")).resolves.toBeNull();
  });

  it("throws when the destination lookup did not complete", async () => {
    useResults({ v_published_destinations: { data: null, error: outage } });
    await expect(getDestinationPage("tirumala", "en")).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("throws when any section of the page could not be read", async () => {
    useResults({
      v_published_destinations: {
        data: { id: "d1", slug: "tirumala", name_i18n: { en: "Tirumala" } },
        error: null,
      },
      v_published_advisories: { data: null, error: outage },
    });

    await expect(getDestinationPage("tirumala", "en")).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("renders empty sections as empty when they genuinely are", async () => {
    useResults({
      v_published_destinations: {
        data: { id: "d1", slug: "tirumala", name_i18n: { en: "Tirumala" } },
        error: null,
      },
    });

    const page = await getDestinationPage("tirumala", "en");
    expect(page?.destination.id).toBe("d1");
    expect(page?.experiences).toEqual([]);
    expect(page?.advisories).toEqual([]);
  });
});
