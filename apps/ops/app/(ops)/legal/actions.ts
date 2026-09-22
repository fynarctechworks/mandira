"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * The DPDP text travelers read (PRD-PRIV-005, 0054).
 *
 * Admin only, and the database says so too (`legal_notices_admin_update`): this is a
 * statement in the company's name, and an editor who can correct a temple's opening hours
 * is not thereby authorised to write its privacy undertaking.
 *
 * Saved per language rather than as one blob, because the notice a Telugu traveler
 * consents to has to be the one they can read.
 */

export const saveLegalNotice = opsAction({
  roles: ["admin"],
  input: z.object({
    key: z.enum(["consent_notice", "grievance_contact", "privacy_policy"]),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
    // Empty is allowed and meaningful: it un-publishes, and the app then says plainly
    // that nothing has been published rather than showing stale wording.
    body: z.string().max(20_000),
  }),
  handler: async ({ input, supabase, userId }) => {
    const { data: current, error: readError } = await supabase
      .from("legal_notices")
      .select("body_i18n")
      .eq("key", input.key)
      .single();
    if (readError) throw readError;

    const body = { ...((current?.body_i18n as Record<string, string>) ?? {}) };
    const text = input.body.trim();
    if (text === "") delete body[input.locale];
    else body[input.locale] = text;

    const { error } = await supabase
      .from("legal_notices")
      .update({ body_i18n: body, updated_by: userId })
      .eq("key", input.key);
    if (error) throw error;

    revalidatePath("/legal");
    return { key: input.key, locale: input.locale, published: text !== "" };
  },
});
