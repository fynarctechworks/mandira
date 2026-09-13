import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN, type QueryResult } from "../../../../../test/fake-supabase";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("../../../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("@mandhira/db/reporting", () => ({ reportError: vi.fn() }));

const { GET } = await import("./route");

const JOURNEY = "00000000-0000-4000-8000-0000000000c1";
const get = () =>
  GET(new Request(`https://mandhira.test/api/journeys/${JOURNEY}/version`, { method: "GET" }));

function signedIn(tables: Record<string, QueryResult>) {
  state.client = fakeSupabase({ user: SIGNED_IN, tables }).client;
}

beforeEach(() => {
  state.client = null;
});

describe("GET /api/journeys/:id/version", () => {
  it("is the latest change to the journey or any of its items", async () => {
    signedIn({
      journeys: { data: { updated_at: "2026-09-13T10:00:00Z" }, error: null },
      journey_items: { data: { updated_at: "2026-09-13T10:05:00Z" }, error: null },
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ version: "2026-09-13T10:05:00Z" });
  });

  it("is the journey's own time when nothing in it changed later", async () => {
    signedIn({
      journeys: { data: { updated_at: "2026-09-13T11:00:00Z" }, error: null },
      journey_items: { data: null, error: null },
    });

    expect((await (await get()).json()).data).toEqual({ version: "2026-09-13T11:00:00Z" });
  });

  it("does not exist for a journey the traveler cannot see", async () => {
    signedIn({ journeys: { data: null, error: null } });

    expect((await get()).status).toBe(404);
  });

  it("needs an account", async () => {
    state.client = fakeSupabase({ user: null }).client;

    expect((await get()).status).toBe(401);
  });
});
