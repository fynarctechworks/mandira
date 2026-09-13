import { describe, expect, it, vi } from "vitest";

import { fakeSupabase, SIGNED_IN } from "../test/fake-supabase";
import { erasureDate, getAccount, listTravelers, removeTraveler, requestErasure } from "./account";
import { DataUnavailableError } from "./data-error";

vi.mock("./supabase", () => ({ webSupabase: vi.fn() }));

type Client = Parameters<typeof getAccount>[0];
const as = (fake: ReturnType<typeof fakeSupabase>) => fake.client as unknown as Client;
const outage = { code: "08006", message: "connection terminated" };

describe("getAccount", () => {
  it("says when a pending erasure will happen", async () => {
    const fake = fakeSupabase({
      tables: {
        profiles: {
          data: { display_name: "Lakshmi", locale: "te", deleted_at: "2026-09-13T06:00:00Z" },
          error: null,
        },
      },
    });

    await expect(getAccount(as(fake), SIGNED_IN)).resolves.toEqual({
      email: SIGNED_IN.email,
      displayName: "Lakshmi",
      locale: "te",
      erasureScheduledFor: "2026-10-13T06:00:00.000Z",
    });
  });

  it("throws rather than showing an empty profile when the read did not complete", async () => {
    const fake = fakeSupabase({ tables: { profiles: { data: null, error: outage } } });
    await expect(getAccount(as(fake), SIGNED_IN)).rejects.toBeInstanceOf(DataUnavailableError);
  });
});

describe("erasureDate", () => {
  it("is thirty days after the request", () => {
    expect(erasureDate("2026-01-31T00:00:00Z")).toBe("2026-03-02T00:00:00.000Z");
  });
});

describe("travelers", () => {
  it("lists them in the shape screens use", async () => {
    const fake = fakeSupabase({
      tables: {
        traveler_profiles: {
          data: [{ id: "t1", label: null, mobility: "full", age_band: "adult", is_self: true }],
          error: null,
        },
      },
    });

    await expect(listTravelers(as(fake))).resolves.toEqual([
      { id: "t1", label: null, mobility: "full", ageBand: "adult", isSelf: true },
    ]);
  });

  it("never removes the traveler's own profile", async () => {
    const fake = fakeSupabase({
      tables: { traveler_profiles: { data: { id: "t1", is_self: true }, error: null } },
    });

    await expect(removeTraveler(as(fake), "t1")).resolves.toBe("is_self");
    expect(fake.calls.some((call) => call.method === "update")).toBe(false);
  });

  it("reports a traveler it cannot see as not found", async () => {
    const fake = fakeSupabase({ tables: { traveler_profiles: { data: null, error: null } } });
    await expect(removeTraveler(as(fake), "t9")).resolves.toBe("not_found");
  });
});

describe("requestErasure", () => {
  it("throws when the database did not accept the request", async () => {
    const fake = fakeSupabase({ rpc: { request_account_deletion: { data: null, error: outage } } });
    await expect(requestErasure(as(fake))).rejects.toBeInstanceOf(DataUnavailableError);
  });
});
