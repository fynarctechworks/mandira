import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase } from "../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown, searchKnowledge: vi.fn() }));

vi.mock("../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("../../../lib/knowledge", () => ({ searchKnowledge: state.searchKnowledge }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { GET } = await import("./route");

const get = (query: string) =>
  GET(new Request(`https://mandhira.test/api/search?${query}`, { method: "GET" }));

beforeEach(() => {
  state.client = fakeSupabase({ user: null }).client;
  state.searchKnowledge
    .mockReset()
    .mockResolvedValue({ experiences: [], places: [], filtersApplied: true });
});

describe("GET /api/search", () => {
  it("lets a guest search", async () => {
    const response = await get("q=aarti");

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      experiences: [],
      places: [],
      filtersApplied: true,
    });
  });

  it("refuses a query past the length the form allows", async () => {
    expect((await get(`q=${"a".repeat(201)}`)).status).toBe(400);
    expect(state.searchKnowledge).not.toHaveBeenCalled();
  });

  it("passes on the filters it understands and drops the ones it does not", async () => {
    await get("q=aarti&on=2026-10-12&near=not-a-journey&access=anything&locale=te");

    expect(state.searchKnowledge).toHaveBeenCalledWith(
      "aarti",
      { availableOn: "2026-10-12" },
      "te",
    );
  });
});
