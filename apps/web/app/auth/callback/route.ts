import { createServerSupabase, toCookieAttributes } from "@mandhira/db/client/server";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Exchanges a magic-link / OAuth code for a session.
 *
 * `next` is validated as a same-origin relative path so this cannot be used as an open
 * redirect. Claiming a guest draft (AUTH-03) happens client-side after this returns,
 * because the draft lives in the browser — B-019 wires that up.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/?message=That+link+is+no+longer+valid.`);
  }

  const cookieStore = await cookies();
  const supabase = createServerSupabase({
    getAll: () => cookieStore.getAll(),
    setAll: (items) => {
      for (const { name, value, options } of items) {
        cookieStore.set(name, value, toCookieAttributes(options));
      }
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/?message=That+link+has+expired.+Please+request+a+new+one.`,
    );
  }

  /*
   * PRD-PRIV-004: record that the account holder confirmed they are 18 or older.
   *
   * Here rather than at the request, because this is the first moment a profile row
   * exists. Reaching this line means the link came from `/api/auth/magic-link`, which
   * refuses to send one without the confirmation — so holding a working link IS the
   * confirmation. Stamped once: a traveler signing in again is not asked to re-consent,
   * and re-stamping would lose when they first told us.
   */
  const userId = data.user?.id;
  if (userId) {
    await supabase
      .from("profiles")
      .update({ adult_confirmed_at: new Date().toISOString() })
      .eq("id", userId)
      .is("adult_confirmed_at", null);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
