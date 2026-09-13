import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types";

/**
 * The TRD §6.2 limit table, verbatim.
 *
 * Kept as data rather than scattered across route handlers so that "what are our limits"
 * has one answer, and so a limit can be adjusted without hunting for every call site.
 * A scope may carry more than one window — 10/hour AND 30/day — and every window must
 * pass; the first that refuses is the one reported.
 */
export const RATE_LIMITS = {
  intent_extract: [
    { limit: 10, windowSeconds: 3600 },
    { limit: 30, windowSeconds: 86_400 },
  ],
  search: [{ limit: 60, windowSeconds: 60 }],
  journeys_write: [{ limit: 120, windowSeconds: 3600 }],
  reports_create: [
    { limit: 5, windowSeconds: 3600 },
    { limit: 20, windowSeconds: 86_400 },
  ],
  share_create: [{ limit: 10, windowSeconds: 86_400 }],
  push_subscribe: [{ limit: 10, windowSeconds: 86_400 }],
  analytics: [{ limit: 300, windowSeconds: 3600 }],
  auth_magic_link: [{ limit: 5, windowSeconds: 3600 }],
  ops_ai_extract: [{ limit: 60, windowSeconds: 86_400 }],
  ops_translate_suggest: [{ limit: 200, windowSeconds: 86_400 }],
  travel_estimate: [{ limit: 1500, windowSeconds: 86_400 }],
  /*
   * Not in TRD §6.2, added by D-151 after the audit found every Ops Server Action unlimited.
   * Generous enough that a researcher working through a destination never meets it; tight
   * enough that a stolen session cannot rewrite the knowledge base in a loop.
   */
  ops_action: [
    { limit: 60, windowSeconds: 60 },
    { limit: 1500, windowSeconds: 3600 },
  ],
} as const satisfies Record<string, readonly { limit: number; windowSeconds: number }[]>;

export type RateLimitScope = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  allowed: boolean;
  /** How many calls remain in the tightest window that is still open. */
  remaining: number;
  /** When that window resets — the value a `Retry-After` header is derived from. */
  resetAt: Date;
  /** Seconds until reset, rounded up, for `Retry-After` directly. */
  retryAfterSeconds: number;
};

/**
 * Consume one unit of a rate limit (TRD §6.2, TRD-SEC-001).
 *
 * The counting happens in `consume_rate_limit()` in the database, not here: the check and
 * the increment have to be one statement, or two concurrent requests both read "9 of 10"
 * and both proceed — precisely the case a rate limiter exists for.
 *
 * `key` identifies the caller: a user id, an anon session id, an email, or "global".
 * Never an IP address — those are personal data under DPDP, and no limit in §6.2 needs one.
 *
 * Requires a service-role client. The RPC is revoked from anon and authenticated on
 * purpose, so that a signed-in user cannot burn someone else's quota by passing their key.
 */
export async function rateLimit(
  supabase: SupabaseClient<Database>,
  scope: RateLimitScope,
  key: string,
): Promise<RateLimitResult> {
  const windows = RATE_LIMITS[scope];
  let tightest: RateLimitResult | null = null;

  for (const window of windows) {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_scope: scope,
      p_key: key,
      p_limit: window.limit,
      p_window_seconds: window.windowSeconds,
    });

    // A limiter that fails open on a database error is not a limiter. The caller sees a
    // refusal it can retry rather than an unbounded door.
    if (error || !data?.[0]) {
      const resetAt = new Date(Date.now() + window.windowSeconds * 1000);
      return { allowed: false, remaining: 0, resetAt, retryAfterSeconds: window.windowSeconds };
    }

    const row = data[0];
    const result: RateLimitResult = {
      allowed: row.allowed,
      remaining: row.remaining,
      resetAt: new Date(row.reset_at),
      retryAfterSeconds: retryAfter(row.reset_at),
    };

    // The first refusal stops here, leaving the wider windows unconsumed. Someone who hits
    // their hourly cap and retries should not also burn the rest of the day doing it —
    // the hourly cap already stops them, and charging the daily budget for calls that were
    // refused anyway punishes an honest retry loop.
    if (!result.allowed) return result;
    if (!tightest || result.remaining < tightest.remaining) tightest = result;
  }

  // No windows configured cannot happen for a declared scope, but returning "allowed with
  // nothing left" beats returning a lie about a limit that does not exist.
  return tightest ?? { allowed: true, remaining: 0, resetAt: new Date(), retryAfterSeconds: 0 };
}

function retryAfter(resetAt: string): number {
  return Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000));
}
