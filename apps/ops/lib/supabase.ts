import { cookies } from "next/headers";
import { createServerSupabase, toCookieAttributes } from "@mandhira/db/client/server";

/**
 * Server-side Supabase client for the Ops app, bound to the request's cookies.
 * Acts as the signed-in operator, so RLS applies exactly as it would to any other query.
 */
export async function opsSupabase() {
  const cookieStore = await cookies();
  return createServerSupabase({
    getAll: () => cookieStore.getAll(),
    setAll: (items) => {
      for (const { name, value, options } of items) {
        cookieStore.set(name, value, toCookieAttributes(options));
      }
    },
  });
}
