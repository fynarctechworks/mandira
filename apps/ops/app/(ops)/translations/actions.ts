"use server";

import { createAiCacheStore, createAiCallLog } from "@mandhira/db/ai-store";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { rateLimit } from "@mandhira/db/rate-limit";
import { AiUnavailableError, createVercelAiProvider, isAiConfigured } from "@mandhira/providers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

const locale = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);

const refuse = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

/**
 * A suggested translation of one string from its English (O17, TRD §7.1 `suggestTranslation`).
 *
 * Returned to the editor and never stored: the translator saves it as a draft or confirms it,
 * so nothing a model wrote reaches `ui_strings` without a person accepting it. A suggestion
 * that changes a time or number from the English is discarded in code before it gets here.
 */
export const suggestUiString = opsAction({
  roles: ["translator", "admin"],
  input: z.object({ key: z.string().min(1).max(200), locale }),
  handler: async ({ input, supabase, userId }) => {
    if (input.locale === "en")
      throw refuse("English is the source, so there is nothing to suggest.");
    if (!isAiConfigured()) {
      throw refuse("Suggestions need an AI provider key, which isn't configured yet.");
    }

    const { data: source, error } = await supabase
      .from("ui_strings")
      .select("value")
      .eq("key", input.key)
      .eq("locale", "en")
      .maybeSingle();
    if (error) throw error;
    if (!source) throw refuse("This string has no English text to translate from yet.");

    const service = createServiceRoleSupabase();
    const limit = await rateLimit(service, "ops_translate_suggest", userId);
    if (!limit.allowed) {
      throw refuse(
        `That's today's suggestion limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
      );
    }

    const provider = createVercelAiProvider({
      cache: createAiCacheStore(service),
      log: createAiCallLog(service),
    });

    const suggestion = await provider
      .suggestTranslation({ text: source.value, from: "en", to: input.locale, context: input.key })
      .catch((cause: unknown) => {
        if (cause instanceof AiUnavailableError) {
          throw refuse("The suggestion service didn't answer. Try again shortly.");
        }
        throw cause;
      });

    if (suggestion.value.text === null) {
      throw refuse(
        "The suggestion changed a time or number from the English, so it was discarded.",
      );
    }
    return { value: suggestion.value.text };
  },
});

/**
 * Editing UI copy (O17, PRD F19). Translators and admins only, as `ui_strings_translator_write`
 * (0008). `ai_draft` is never set from here: a person either leaves a draft or confirms it.
 */
export const saveUiString = opsAction({
  roles: ["translator", "admin"],
  input: z.object({
    key: z.string().min(1).max(200),
    locale,
    value: z.string().trim().min(1, "A translation can't be empty").max(2000),
    status: z.enum(["draft", "confirmed"]),
  }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.from("ui_strings").upsert(input, { onConflict: "key,locale" });
    if (error) throw error;

    revalidatePath("/translations");
    return { key: input.key, locale: input.locale, status: input.status };
  },
});
