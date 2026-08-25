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
    /*
     * Skip Next internals and static assets — locale negotiation on every icon request is
     * pure cost — AND every non-page route.
     *
     * `api/` and `auth/` are not pages and have no locale. Leaving them in sent
     * `/api/heartbeat` to `/en/api/heartbeat` with a 307, which meant the Vercel Cron
     * keepalive silently never ran (cron does not follow redirects) and a traveler
     * following a magic link landed on a 404. Both were live from B-014 until B-019 became
     * the first thing to call an API route from a browser.
     */
    "/((?!api/|auth/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
