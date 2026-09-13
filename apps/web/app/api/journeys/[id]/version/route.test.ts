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

/** The journey row as a traveler edits it; `updated_at` is there to prove it is ignored. */
const JOURNEY_ROW = {
  title: "Tirumala",
  start_date: "2026-10-12",
  end_date: "2026-10-13",
  timezone: "Asia/Kolkata",
  day_start_time: "06:00:00",
  day_end_time: "21:00:00",
  pace: "balanced",
  status: "upcoming",
  updated_at: "2026-09-13T10:00:00Z",
};

async function versionFor(
  journey: Record<string, unknown>,
  item: { updated_at: string } | null,
): Promise<string> {
  signedIn({
    journeys: { data: journey, error: null },
    journey_items: { data: item, error: null },
  });
  const response = await get();
  expect(response.status).toBe(200);
  return (await response.json()).data.version as string;
}

beforeEach(() => {
  state.client = null;
});

describe("GET /api/journeys/:id/version", () => {
  it("changes when any item of the journey changes", async () => {
    const before = await versionFor(JOURNEY_ROW, { updated_at: "2026-09-13T10:05:00Z" });
    const after = await versionFor(JOURNEY_ROW, { updated_at: "2026-09-13T10:06:00Z" });

    expect(after).not.toBe(before);
  });

  it("changes when the traveler edits the journey itself", async () => {
    const item = { updated_at: "2026-09-13T10:05:00Z" };
    const before = await versionFor(JOURNEY_ROW, item);

    expect(await versionFor({ ...JOURNEY_ROW, title: "Tirumala with Amma" }, item)).not.toBe(
      before,
    );
    expect(await versionFor({ ...JOURNEY_ROW, day_start_time: "05:30:00" }, item)).not.toBe(before);
    expect(await versionFor({ ...JOURNEY_ROW, end_date: "2026-10-14" }, item)).not.toBe(before);
  });

  it("does not change for bookkeeping that only moves the journey's updated_at", async () => {
    // The knowledge check stamps `knowledge_checked_at` seconds after a journey opens; taking
    // that for an edit refreshed every open view for nothing.
    const item = { updated_at: "2026-09-13T10:05:00Z" };
    const before = await versionFor(JOURNEY_ROW, item);
    const after = await versionFor(
      {
        ...JOURNEY_ROW,
        updated_at: "2026-09-13T10:07:00Z",
        knowledge_checked_at: "2026-09-13T10:07:00Z",
      },
      item,
    );

    expect(after).toBe(before);
  });

  it("has a version for a journey with nothing in it yet", async () => {
    expect(await versionFor(JOURNEY_ROW, null)).toMatch(/^-\.[0-9a-f]{8}$/);
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
