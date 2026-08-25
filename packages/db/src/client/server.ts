import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "../../types";
import { publicSupabaseConfig, serviceRoleKey } from "./env";

/**
 * The cookie surface `@supabase/ssr` needs. Both apps supply Next's cookie store; keeping
 * it as a parameter means this package never imports `next/headers` and stays usable from
 * a plain Node script or a test.
 */
export type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) => void;
};

/**
 * Narrows Supabase's cookie options to the attributes Next's cookie store models.
 *
 * The two types overlap but are not the same: `@supabase/ssr` passes the cookie library's
 * `SerializeOptions`, which carries an `encode` callback that Next has no field for.
 * Copying the shared attributes across is clearer — and safer — than casting the whole
 * object and hoping the extra key is ignored.
 */
export function toCookieAttributes(options?: CookieOptions) {
  // Always an object, never undefined: under `exactOptionalPropertyTypes` an explicit
  // `undefined` cannot be passed for an optional parameter either.
  if (!options) return {};

  // Keys are omitted rather than set to undefined: the workspace runs with
  // `exactOptionalPropertyTypes`, under which an explicit `undefined` is not assignable
  // to an optional property.
  return {
    ...(options.maxAge !== undefined ? { maxAge: options.maxAge } : {}),
    ...(options.expires !== undefined ? { expires: options.expires } : {}),
    ...(options.domain !== undefined ? { domain: options.domain } : {}),
    ...(options.path !== undefined ? { path: options.path } : {}),
    ...(options.secure !== undefined ? { secure: options.secure } : {}),
    ...(options.httpOnly !== undefined ? { httpOnly: options.httpOnly } : {}),
    ...(options.sameSite !== undefined ? { sameSite: options.sameSite } : {}),
  };
}

/**
 * Server-side client bound to the request's cookies, so it acts as the signed-in user and
 * RLS applies normally. This is the default for anything running on the server.
 */
export function createServerSupabase(cookies: CookieAdapter) {
  const { url, anonKey } = publicSupabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (items) => {
        try {
          cookies.setAll(items);
        } catch {
          // Server Components cannot set cookies. That is expected and harmless: the
          // middleware refreshes the session on every request, so the write is redundant
          // here rather than lost.
        }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES RLS COMPLETELY (TRD §6.1) — every row of every table is
 * reachable, including `traveler_profiles`.
 *
 * Only for server route handlers and Edge Functions that genuinely need to act outside a
 * user's permissions (scheduled jobs, the notification sender). If a user is making the
 * request, use `createServerSupabase` instead so their permissions still apply.
 */
export function createServiceRoleSupabase() {
  const { url } = publicSupabaseConfig();

  return createServerClient<Database>(url, serviceRoleKey(), {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
