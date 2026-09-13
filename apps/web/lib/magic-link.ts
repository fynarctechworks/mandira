import { createHash } from "node:crypto";

/**
 * Helpers for `POST /api/auth/magic-link`, kept out of the route file because a Next route may
 * export only its handlers and route config.
 */

/** A rate-limit key for an address that never stores the address itself. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Where the link returns to. The configured app URL when there is one; otherwise this request's
 * origin. Supabase Auth only honours redirect URLs on its allowlist, so neither can send a
 * traveler to somebody else's site.
 */
export function appOrigin(request: Request): string {
  const configured = process.env["NEXT_PUBLIC_APP_URL"]?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

/** A path on this site, or the home screen. Never `//elsewhere` or an absolute URL. */
export function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/en";
}
