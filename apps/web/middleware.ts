import { refreshSession } from "@mandhira/db/client/middleware";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Keeps the session token fresh. It does NOT gate anything.
 *
 * The traveler app is guest-first (PRD F13, AUTH-03): browsing and building a draft
 * journey must work with no account at all — the draft lives on the device until sign-in
 * claims it. Individual write routes require a user, and RLS enforces ownership on every
 * query, so the gate belongs there rather than at the door.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  await refreshSession(request, response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
