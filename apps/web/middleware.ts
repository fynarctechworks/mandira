import { refreshSession } from "@mandhira/db/client/middleware";
import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

const handleLocale = createIntlMiddleware(routing);

/**
 * Locale routing plus session refresh.
 *
 * The order matters: next-intl decides the response first (it may redirect `/` to `/en`),
 * and the refreshed auth cookies are then attached to whatever response is going out. Run
 * the other way around, a redirect would discard the refreshed session and the traveler
 * would be quietly signed out on their first visit.
 *
 * This gates NOTHING. The traveler app is guest-first (AUTH-03): browsing and building a
 * draft journey must work with no account at all.
 */
export async function middleware(request: NextRequest) {
  const response = handleLocale(request);
  await refreshSession(request, response as NextResponse);
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals, the service worker, the manifest and static assets — running
    // locale negotiation on every icon request is pure cost.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
