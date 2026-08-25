import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../types";
import { publicSupabaseConfig } from "./env";

/**
 * Browser-side Supabase client. Typed against the generated schema, so a query against a
 * column that does not exist fails at compile time.
 *
 * Uses the anon key: every request is still subject to RLS (0008), so this client can
 * only reach what the signed-in user is allowed to reach.
 */
export function createBrowserSupabase() {
  const { url, anonKey } = publicSupabaseConfig();
  return createBrowserClient<Database>(url, anonKey);
}
