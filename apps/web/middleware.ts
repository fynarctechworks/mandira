import { refreshSession } from "@mandhira/db/client/middleware";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { DEVICE_COOKIE } from "./lib/api";

const handleLocale = createIntlMiddleware(routing);

/**
 * The saved-journey area, which is the only part of the traveler app that needs an account.
 *
 * Everything else stays guest-first (AUTH-03): browsing, searching, and building a draft
 * journey must work with no account at all — and `/s/<token>` in particular is opened by
 * people who will never have one.
 *
 * Matched after the locale prefix is stripped, so `/en/journeys/…` and `/te/journeys/…`
 * are the same rule.
 */
const SIGNED_IN_ONLY = [
  /^\/journeys(\/|$)/,
  // The Ops preview (OPS-PREVIEW-01). RLS and the page's own Ops check are the control.
  /^\/preview(\/|$)/,
];

/**
 * Locale routing, session refresh, and the sign-in gate.
 *
 * The order matters: next-intl decides the response first (it may redirect `/` to `/en`),
 * and the refreshed auth cookies are then attached to whatever response is going out. Run
 * the other way around, a redirect would discard the refreshed session and the traveler
 * would be quietly signed out on their first visit.
 *
 * WHY THE GATE IS HERE AND NOT ONLY IN THE PAGE. Each journey page already calls
 * `redirect()` when there is no user, and that is kept — but once a route has a
 * `loading.tsx`, Next streams it, and a `redirect()` from a server component can no longer
 * become a real HTTP redirect. The signed-out visitor gets a 200, a shell, a skeleton, and
 * only then a client-side navigation to sign-in. Deciding here happens before any of that
 * is sent, so the answer is a plain 307 again.
 *
 * This is UX, never a control. RLS is what actually stops one traveler reading another's
 * journey, and the in-page check stays as defence in depth (CLAUDE.md §4: UI hiding is
 * never a control).
 */
export async function middleware(request: NextRequest) {
  const response = handleLocale(request);
  const { user } = await refreshSession(request, response as NextResponse);

  ensureDeviceCookie(request, response as NextResponse);

  if (!user && needsAccount(request.nextUrl.pathname)) {
    // A locale-less `/journeys/…` has no locale to keep, and `//sign-in` is a URL for the
    // host "sign-in" rather than a path — so it falls back to the default locale.
    const locale = localeOf(request.nextUrl.pathname) || routing.defaultLocale;
    const target = new URL(`/${locale}/sign-in`, request.url);
    // `next` carries them back to the page they asked for, rather than to a home screen
    // they did not want (the same contract B-019's save flow relies on).
    target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

    const redirected = NextResponse.redirect(target);
    // The refreshed cookies live on `response`; a new response would drop them and sign
    // the traveler out on the very request that was meant to send them to sign-in.
    for (const cookie of (response as NextResponse).cookies.getAll()) {
      redirected.cookies.set(cookie);
    }
    return redirected;
  }

  return response;
}

/**
 * Give a guest a stable identity for rate limiting (OPEN-011, TRD §6.2).
 *
 * `withApi` keys a guest's rate limit on this cookie and falls back to the literal string
 * "anonymous" when it is missing — which means every guest in the country shares one
 * bucket, and the first traveler to spend their ten intent extractions spends everyone's.
 * Nothing set it until now.
 *
 * Deliberately NOT keyed on IP: TRD §6.2 keys limits on a session, and DPDP treats an IP as
 * personal data. This is a random opaque value that identifies a browser and nothing else —
 * no user, no device fingerprint, nothing that survives clearing site data. `httpOnly` so
 * page scripts cannot read it, `lax` so it survives arriving from a shared link.
 *
 * Set in middleware because it is the only place in a Next app that can write a cookie on
 * every request, including the first one a guest ever makes.
 */
function ensureDeviceCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(DEVICE_COOKIE)) return;

  response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** The path with its locale prefix removed, so the rules are written once. */
function needsAccount(pathname: string): boolean {
  const locale = localeOf(pathname);
  const rest = locale ? pathname.slice(locale.length + 1) : pathname;
  return SIGNED_IN_ONLY.some((pattern) => pattern.test(rest || "/"));
}

function localeOf(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return (routing.locales as readonly string[]).includes(first) ? first : "";
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
     *
     * `design-system` is excluded for the same reason: the reference page is locale-less
     * and carries its own <html>, so negotiating a locale for it would only redirect to
     * /en/design-system, which does not exist.
     */
    "/((?!api/|auth/|design-system|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
