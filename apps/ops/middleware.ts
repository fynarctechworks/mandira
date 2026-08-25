import { refreshSession } from "@mandhira/db/client/middleware";
import { type NextRequest, NextResponse } from "next/server";

/** Paths reachable without being signed in. Everything else requires an Ops session. */
const PUBLIC_PATHS = ["/sign-in", "/auth/callback", "/auth/error"];

/**
 * Refreshes the session, then keeps anonymous visitors out of the Ops app entirely.
 *
 * This is the OUTER gate and it is deliberately coarse: it only asks "is anyone signed
 * in?". Whether that person holds an Ops role is decided in the root layout against the
 * database, and RLS re-checks every individual query regardless (TRD §6.1 — three layers,
 * always).
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { user } = await refreshSession(request, response);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    // Preserve where they were heading so sign-in can return them there.
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (user && pathname === "/sign-in") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  // Skip static assets and images — running auth on every icon request is pure cost.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
