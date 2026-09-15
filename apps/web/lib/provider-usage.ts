import { createServiceRoleSupabase } from "@mandhira/db/client/server";

/** Providers counted here (MON-01, migration 0050). Gemini is counted from `ai_calls`. */
export type CountedProvider = "openrouteservice" | "resend";

type Client = Pick<ReturnType<typeof createServiceRoleSupabase>, "rpc">;

/**
 * Adds calls to today's count against a provider's free quota (MON-01).
 *
 * Never throws. A count that fails to land makes the Ops dashboard read a little low; a count
 * that threw would break the journey or the email it was only measuring.
 */
export async function recordProviderUsage(
  provider: CountedProvider,
  calls: number,
  client?: Client,
): Promise<void> {
  if (!Number.isFinite(calls) || calls <= 0) return;

  try {
    await (client ?? createServiceRoleSupabase()).rpc("record_provider_usage", {
      p_provider: provider,
      p_calls: Math.round(calls),
    });
  } catch {
    // Deliberately silent; see above.
  }
}
