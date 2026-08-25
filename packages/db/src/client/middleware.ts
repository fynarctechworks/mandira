import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "../../types";
import { publicSupabaseConfig } from "./env";

/**
 * Refreshes the auth session on every request and hands back the user.
 *
 * Server Components cannot write cookies, so without this the access token would expire
 * and never renew — the user would appear randomly signed out. The middleware is the one
 * place in a Next app that can both read and write cookies on every request.
 *
 * The caller owns the response object so it can redirect based on the user; this function
 * only ensures refreshed cookies are attached to whatever response is ultimately sent.
 */
export async function refreshSession(request: NextRequest, response: NextResponse) {
  const { url, anonKey } = publicSupabaseConfig();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value, options } of items) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the token with Supabase. getSession() only decodes the cookie
  // and would trust a forged one, so it must not be used for an authorization decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}
