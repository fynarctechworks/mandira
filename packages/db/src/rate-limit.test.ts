import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "../types";
import { RATE_LIMITS, rateLimit } from "./rate-limit";

type RpcArgs = { p_scope: string; p_key: string; p_limit: number; p_window_seconds: number };

/**
 * The counting lives in `consume_rate_limit()` and is tested against a real database in
 * `supabase/tests/0010_ai_rate_limits_test.sql`. What is worth testing here is the part
 * that is only in TypeScript: which windows get consumed, in what order, and what happens
 * when the database says no or says nothing at all.
 */
function fakeSupabase(responses: { allowed: boolean; remaining: number }[] | { error: true }) {
  const calls: RpcArgs[] = [];
  let index = 0;

  const rpc = vi.fn(async (_name: string, args: RpcArgs) => {
    calls.push(args);
    if ("error" in responses) return { data: null, error: { message: "boom" } };

    const next = responses[index] ?? responses[responses.length - 1]!;
    index += 1;

    return {
      data: [
        {
          allowed: next.allowed,
          remaining: next.remaining,
          reset_at: new Date(Date.now() + args.p_window_seconds * 1000).toISOString(),
        },
      ],
      error: null,
    };
  });

  return { client: { rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}

describe("RATE_LIMITS", () => {
  it("carries the TRD §6.2 table", () => {
    expect(RATE_LIMITS.intent_extract).toEqual([
      { limit: 10, windowSeconds: 3600 },
      { limit: 30, windowSeconds: 86_400 },
    ]);
    expect(RATE_LIMITS.search).toEqual([{ limit: 60, windowSeconds: 60 }]);
    expect(RATE_LIMITS.travel_estimate).toEqual([{ limit: 1500, windowSeconds: 86_400 }]);
  });

  it("gives every scope at least one window", () => {
    for (const [scope, windows] of Object.entries(RATE_LIMITS)) {
      expect(windows.length, scope).toBeGreaterThan(0);
    }
  });
});

describe("rateLimit", () => {
  it("consumes every window of a scope that has more than one", () => {
    const { client, calls } = fakeSupabase([{ allowed: true, remaining: 9 }]);

    return rateLimit(client, "intent_extract", "u1").then((result) => {
      expect(calls.map((c) => c.p_window_seconds)).toEqual([3600, 86_400]);
      expect(result.allowed).toBe(true);
    });
  });

  it("reports the tightest window, not the last one checked", async () => {
    const { client } = fakeSupabase([
      { allowed: true, remaining: 2 },
      { allowed: true, remaining: 25 },
    ]);

    const result = await rateLimit(client, "intent_extract", "u1");

    // "25 left" would be a true statement and a useless one: the hour runs out first.
    expect(result.remaining).toBe(2);
  });

  it("stops at the first refusal, leaving the wider window unconsumed", async () => {
    const { client, calls } = fakeSupabase([{ allowed: false, remaining: 0 }]);

    const result = await rateLimit(client, "intent_extract", "u1");

    expect(result.allowed).toBe(false);
    // Charging the daily budget for calls that were refused anyway punishes an honest
    // retry loop; the hourly cap already stops them.
    expect(calls).toHaveLength(1);
  });

  it("gives a Retry-After the caller can put straight on the response", async () => {
    const { client } = fakeSupabase([{ allowed: false, remaining: 0 }]);

    const result = await rateLimit(client, "search", "u1");

    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses when the database errors — a limiter that fails open is not a limiter", async () => {
    const { client } = fakeSupabase({ error: true });

    const result = await rateLimit(client, "intent_extract", "u1");

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("passes the scope and key through verbatim", async () => {
    const { client, calls } = fakeSupabase([{ allowed: true, remaining: 5 }]);

    await rateLimit(client, "reports_create", "user-123");

    expect(calls[0]).toMatchObject({ p_scope: "reports_create", p_key: "user-123", p_limit: 5 });
  });
});
