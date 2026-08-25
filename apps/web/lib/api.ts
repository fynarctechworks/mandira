import { cookies } from "next/headers";
import { createWithApi } from "@mandhira/db/api";
import { getOpsRoles } from "@mandhira/db/client/roles";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";

import { webSupabase } from "./supabase";

/**
 * The traveler app's route pipeline (BACKEND_ARCHITECTURE, TRD-API-001).
 *
 * Built once here with this app's clients bound in, so no route handler reaches for a
 * Supabase client of its own — and so `packages/db` never has to import `next/headers`.
 */
export const withApi = createWithApi({
  createClient: webSupabase,
  createServiceClient: createServiceRoleSupabase,
  getRoles: getOpsRoles,
  anonKey: anonKeyFromDeviceCookie,
  onUnexpected: (error, context) => {
    // Sentry is wired in B-024. Until then this is the one place an unexpected failure is
    // recorded, and it deliberately logs the cause rather than the response the caller got.
    console.error(`[withApi] ${context.route}`, error);
  },
});

/** The cookie B-019's guest draft sets; named here so both halves agree on it. */
export const DEVICE_COOKIE = "mandhira_device";

/**
 * Who a guest's rate limit is counted against.
 *
 * KNOWN GAP (OPEN-011): nothing sets this cookie yet — the guest draft that issues it is
 * B-019 — so every guest currently shares the "anonymous" bucket. That is harmless while
 * no guest-facing rate-limited route exists, and unacceptable the moment one does: a
 * shared bucket means the first traveler to use their ten intent extractions spends
 * everyone's. `/api/intent/extract` (B-018) must not ship before the cookie does.
 *
 * Not keyed on IP, deliberately: TRD §6.2 keys limits on a session and DPDP treats an IP
 * as personal data. `ip_hash` exists for the audit trail that genuinely needs one.
 */
function anonKeyFromDeviceCookie(request: Request): string {
  const header = request.headers.get("cookie");
  if (!header) return "anonymous";

  const match = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`).exec(header);
  return match?.[1] ? `device:${match[1]}` : "anonymous";
}

/** Available to routes that need the cookie store directly. */
export { cookies };
