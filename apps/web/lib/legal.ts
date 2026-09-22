import { t } from "@mandhira/i18n";

import { webSupabase } from "./supabase";

/**
 * The DPDP text an admin publishes in Ops (PRD-PRIV-005, 0054).
 *
 * Deliberately NOT cached and deliberately tolerant: a consent notice is the one piece of
 * text that must never be served stale, and a page that throws because a notice is absent
 * would take down sign-in over a row nobody has filled in yet. Absent reads as absent, and
 * the screen says so in words.
 */
export type LegalKey = "consent_notice" | "grievance_contact" | "privacy_policy";

export async function getLegalNotice(key: LegalKey, locale: string): Promise<string | null> {
  const supabase = await webSupabase();
  const { data } = await supabase
    .from("legal_notices")
    .select("body_i18n")
    .eq("key", key)
    .maybeSingle();

  const text = t(data?.body_i18n as Record<string, string> | null, locale).trim();
  return text === "" ? null : text;
}

/**
 * Whether both launch-blocking notices are published. The sign-in screen asks before it
 * links to them: a link to an empty page is a worse answer than no link.
 */
export async function legalNoticesReady(): Promise<boolean> {
  const supabase = await webSupabase();
  const { data } = await supabase.rpc("legal_notices_ready");
  return data === true;
}
