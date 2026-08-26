import { analyticsEventSchema, toAnalyticsRow } from "@mandhira/db/analytics";
import { z } from "zod";

import { DEVICE_COOKIE, withApi } from "../../../lib/api";

/**
 * Privacy-safe product analytics (PRD-ANLY-001, TRD §5.2).
 *
 * Guests included — deliberately. Most of PRD §7's funnel happens before anyone signs in,
 * and an analytics route that only counts signed-in travelers measures the wrong end of the
 * product entirely.
 *
 * What makes that safe is that nothing here can identify a person. The event name must be on
 * the allowlist, every property must be named for that event, and the row has no user column
 * to write one into (TRD §4.7). The session id is the device cookie, truncated — enough to
 * group one visit, not enough to follow someone across weeks.
 *
 * Batched, because an app that posts on every tap is an app that drains a battery on a
 * hillside.
 */
const schema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50),
});

export const POST = withApi({
  schema,
  rateLimit: "analytics",
  handler: async ({ input, request, supabase }) => {
    const rows = input.events
      .map((event) => toAnalyticsRow(event, sessionIdFrom(request)))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    /*
     * Everything was refused by the allowlist. Answered as a success: the caller has nothing
     * to do about it, and a 4xx here would surface as an error rate rather than as the
     * client misconfiguration it actually is.
     */
    if (rows.length === 0) return { accepted: 0 };

    const { error } = await supabase.from("analytics_events").insert(rows);

    /*
     * A failed measurement is never the traveler's problem. Analytics must not be able to
     * break a screen, so this is swallowed rather than raised — the same principle as the
     * offline layer's soft failures (D-111).
     */
    if (error) return { accepted: 0 };

    return { accepted: rows.length };
  },
});

/**
 * The visit's identifier: the guest device cookie, which is opaque and random.
 *
 * Not the user id, ever — `analytics_events` has no column for one, and this route must not
 * become the thing that invents a way around that. Not the IP either: TRD §6.2 keys on
 * sessions, and DPDP treats an IP as personal data.
 */
function sessionIdFrom(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const match = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`).exec(header);
  return match?.[1] ?? null;
}
