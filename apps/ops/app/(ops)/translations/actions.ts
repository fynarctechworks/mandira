"use server";

import { createAiCacheStore, createAiCallLog } from "@mandhira/db/ai-store";
import { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { rateLimit } from "@mandhira/db/rate-limit";
import { AiUnavailableError, createVercelAiProvider, isAiConfigured } from "@mandhira/providers";
import { revalidatePath } from "next/cache";
import { uuid } from "@mandhira/db";
import { z } from "zod";
import { opsAction } from "@/lib/action";
import type { opsSupabase } from "@/lib/supabase";

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

    return {
      value: await suggestFromEnglish(userId, {
        text: source.value,
        to: input.locale,
        context: input.key,
      }),
    };
  },
});

/**
 * One suggestion from English, shared by interface strings and content. Rate-limited per
 * operator (`ops_translate_suggest`, TRD §6.2); a suggestion that changes a time or number is
 * refused rather than returned.
 */
async function suggestFromEnglish(
  userId: string,
  input: { text: string; to: string; context: string },
): Promise<string> {
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
    .suggestTranslation({ text: input.text, from: "en", to: input.to, context: input.context })
    .catch((cause: unknown) => {
      if (cause instanceof AiUnavailableError) {
        throw refuse("The suggestion service didn't answer. Try again shortly.");
      }
      throw cause;
    });

  if (suggestion.value.text === null) {
    throw refuse("The suggestion changed a time or number from the English, so it was discarded.");
  }
  return suggestion.value.text;
}

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

// ── Content, one entity at a time (OPS-TRANS-02, 0049) ────────────────────────────────

const translatableTable = z.enum(["destinations", "places", "experiences"]);
const translatableField = z.string().regex(/^[a-z_]+_i18n$/);

/** Refusals from `save_content_translation()` are written for an operator; pass them on. */
const OPERATOR_REFUSALS = new Set(["23514", "P0002", "42501"]);

/**
 * Saves one translated field of a destination, place or experience (O17, PRD F19).
 *
 * `save_content_translation()` is the permission: it accepts only a non-English value of an
 * allowlisted field, so no input to this action can turn it into a general editor.
 */
export const saveContentTranslation = opsAction({
  roles: ["translator", "editor", "admin"],
  input: z.object({
    entityTable: translatableTable,
    entityId: uuid,
    field: translatableField,
    locale,
    value: z.string().max(4000, "A translation can be at most 4,000 characters"),
    status: z.enum(["ai_draft", "draft", "confirmed"]),
  }),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.rpc("save_content_translation", {
      p_entity_table: input.entityTable,
      p_entity_id: input.entityId,
      p_field: input.field,
      p_locale: input.locale,
      p_text: input.value,
      p_status: input.status,
    });
    if (error) {
      if (OPERATOR_REFUSALS.has(error.code)) throw refuse(error.message);
      throw error;
    }

    revalidatePath("/translations");
    revalidatePath(`/translations/${input.entityTable}/${input.entityId}`);
    return { status: data };
  },
});

/**
 * A suggested translation of one content field from its English (TRD §5
 * `POST /api/ops/translate/suggest`). Returned to the page and never stored (TRD-AI-003).
 */
export const suggestContentTranslation = opsAction({
  roles: ["translator", "editor", "admin"],
  input: z.object({
    entityTable: translatableTable,
    entityId: uuid,
    field: translatableField,
    locale,
  }),
  handler: async ({ input, supabase, userId }) => {
    if (input.locale === "en")
      throw refuse("English is the source, so there is nothing to suggest.");
    if (!isAiConfigured()) {
      throw refuse("Suggestions need an AI provider key, which isn't configured yet.");
    }

    const english = await englishOf(supabase, input.entityTable, input.entityId, input.field);
    return {
      value: await suggestFromEnglish(userId, {
        text: english,
        to: input.locale,
        context: `${input.entityTable}.${input.field}`,
      }),
    };
  },
});

async function englishOf(
  supabase: Awaited<ReturnType<typeof opsSupabase>>,
  table: z.infer<typeof translatableTable>,
  id: string,
  field: string,
): Promise<string> {
  const { data: fields, error: fieldsError } = await supabase.rpc("translatable_fields", {
    p_entity_table: table,
  });
  if (fieldsError) throw fieldsError;
  if (!(fields ?? []).includes(field)) throw refuse("That field cannot be translated here.");

  // The table is one of three, checked by the schema; the client types each separately.
  const { data, error } = await supabase
    .from(table as "places")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw refuse("That entry no longer exists.");

  const value = (data as unknown as Record<string, unknown>)[field] as Record<
    string,
    string
  > | null;
  const english = value?.["en"]?.trim();
  if (!english) throw refuse("There is no English to translate from yet.");
  return english;
}
