import { createServerSupabase, toCookieAttributes } from "@mandhira/db/client/server";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Exchanges the magic-link / OAuth code for a session, then returns the operator to
 * wherever they were headed.
 *
 * `next` is validated as a same-origin relative path before use: accepting it verbatim
 * would turn this route into an open redirect that an attacker could point at their own
 * site from a legitimate-looking Mandhira link.
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
    return NextResponse.redirect(`${origin}/sign-in?message=That+link+is+no+longer+valid.`);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?message=That+link+has+expired.+Please+request+a+new+one.`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
