"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Locale management (O18, PRD F19). Adding a language is inserting a row here — the editors
 * and the traveler app read the list rather than hardcoding it (D-028). Admin only, as in
 * `locales_admin_write` (0008).
 */

const refuse = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

const localeFields = {
  name_native: z.string().trim().min(1, "Give its name in its own script").max(80),
  name_en: z.string().trim().min(1, "Give its English name").max(80),
  script: z
    .string()
    .trim()
    .regex(/^[A-Z][a-z]{3}$/, "Use the four-letter ISO 15924 code, e.g. Deva"),
  transliteration_scheme: z.string().trim().max(80).nullable(),
  sort_order: z.number().int().min(0).max(10_000),
};

const code = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "Use a language code such as te, hi or en-IN");

export const addLocale = opsAction({
  roles: ["admin"],
  input: z.object({ code, ...localeFields, is_active: z.boolean() }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.from("locales").insert({
      ...input,
      transliteration_scheme: input.transliteration_scheme || null,
    });
    if (error?.code === "23505") throw refuse(`${input.code} is already a locale.`);
    if (error) throw error;

    revalidatePath("/locales");
    return { code: input.code };
  },
});

export const updateLocale = opsAction({
  roles: ["admin"],
  input: z.object({ code, ...localeFields }),
  handler: async ({ input, supabase }) => {
    const { code: key, ...fields } = input;
    const { data, error } = await supabase
      .from("locales")
      .update({ ...fields, transliteration_scheme: fields.transliteration_scheme || null })
      .eq("code", key)
      .select("code");
    if (error) throw error;
    if (data.length === 0) throw refuse("That locale no longer exists.");

    revalidatePath("/locales");
    return { code: key };
  },
});

export const setLocaleActive = opsAction({
  roles: ["admin"],
  input: z.object({ code, is_active: z.boolean() }),
  handler: async ({ input, supabase }) => {
    // English is the fallback every missing translation resolves to (PRD-KNOW-005).
    if (input.code === "en" && !input.is_active) {
      throw refuse("English is the fallback for every missing translation, so it stays active.");
    }

    const { data, error } = await supabase
      .from("locales")
      .update({ is_active: input.is_active })
      .eq("code", input.code)
      .select("code");
    if (error) throw error;
    if (data.length === 0) throw refuse("That locale no longer exists.");

    revalidatePath("/locales");
    return { code: input.code, is_active: input.is_active };
  },
});
