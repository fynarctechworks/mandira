import { cookies } from "next/headers";
import { createServerSupabase, toCookieAttributes } from "@mandhira/db/client/server";

/** Server-side Supabase client for the traveler app, bound to the request's cookies. */
export async function webSupabase() {
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
