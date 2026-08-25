"use server";

import { uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Source registry (O08, PRD-OPS-SRC-001, PRD F17).
 *
 * Every fact in Mandhira points at one of these, and the source's tier is what the
 * traveler's confidence badge is ultimately derived from — so this is not a reference
 * list, it is the root of the trust model.
 *
 * Only `manual` ingestion is offered in M1 (backlog B-011). The other methods exist in
 * the schema and arrive with the ingestion pipeline in M3 (B-029); offering them now would
 * let an operator configure a monitor that nothing runs.
 */

const sourceType = z.enum([
  "official_authority",
  "official_destination_org",
  "government",
  "licensed_provider",
  "partner",
  "structured_service",
  "curated_research",
  "user_report",
]);

const sourceFields = {
  name: z.string().min(1, "A name is required").max(200),
  source_type: sourceType,
  tier: z.enum(["T1", "T2", "T3", "T4", "T5"]),
  url: z.string().url("Enter a full URL").nullish().or(z.literal("")),
  contact: z.string().max(200).nullish(),
  refresh_cadence_days: z.number().int().positive().max(3650).nullish(),
  status: z.enum(["active", "paused", "retired"]).default("active"),
  notes: z.string().max(2000).nullish(),
};

const createSchema = z.object(sourceFields);
const updateSchema = z.object({ id: uuid, ...sourceFields });

function toRow(input: Record<string, unknown>) {
  const rest = { ...input };
  delete rest["id"];
  return {
    ...rest,
    url: (rest["url"] as string) || null,
    contact: (rest["contact"] as string) || null,
    notes: (rest["notes"] as string) || null,
    // M1 registers sources by hand; monitors and feeds land with B-029.
    ingestion_method: "manual" as const,
  };
}

export const createSource = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("sources")
      .insert(asRow(toRow(input as Record<string, unknown>)))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/sources");
    return { id: data.id };
  },
});

export const updateSource = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: updateSchema,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("sources")
      .update(asRow(toRow(input as Record<string, unknown>)))
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/sources");
    revalidatePath(`/sources/${input.id}`);
    return { id: input.id };
  },
});

/**
 * Retire rather than delete.
 *
 * Trust records point at sources, and a deleted source would leave verified facts unable
 * to say what they were verified against. `retired` keeps the history readable while
 * removing the source from the pickers.
 */
export const retireSource = opsAction({
  roles: ["editor", "admin"],
  input: z.object({ id: uuid }),
  handler: async ({ input, supabase }) => {
    const { error } = await supabase
      .from("sources")
      .update({ status: "retired" })
      .eq("id", input.id);
    if (error) throw error;

    revalidatePath("/sources");
    return { id: input.id };
  },
});
