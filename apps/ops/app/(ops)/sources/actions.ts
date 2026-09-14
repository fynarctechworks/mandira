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
 * `url_monitor` became real with B-029: a source set to it is fetched on its cadence, its
 * capture diffed against the last one, and a change candidate raised when the evidence for
 * a published field disappears. `api` and `file_upload` remain in the schema and are
 * deliberately NOT offered — a method nothing runs is worse than an absent one, because an
 * operator would configure it and believe the source was being watched.
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
  ingestion_method: z.enum(["manual", "url_monitor"]).default("manual"),
  status: z.enum(["active", "paused", "retired"]).default("active"),
  notes: z.string().max(2000).nullish(),
  /** Who keeps this source checked (PRD F17). Must be someone in Ops. */
  owner_user_id: uuid.nullish().or(z.literal("")),
  /** The destinations this source covers — `sources.coverage`, an array of ids (TRD §4.3). */
  coverage: z.array(uuid).max(500).default([]),
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
    owner_user_id: (rest["owner_user_id"] as string) || null,
  };
}

/** An owner has to be someone in Ops; anyone else cannot keep a source checked. */
async function assertOwnerInOps(
  supabase: Parameters<Parameters<typeof opsAction>[0]["handler"]>[0]["supabase"],
  ownerId: string | null | undefined,
) {
  if (!ownerId) return;
  const { data, error } = await supabase.rpc("ops_colleagues");
  if (error) throw error;
  if (!(data ?? []).some((colleague) => colleague.user_id === ownerId)) {
    throw Object.assign(new Error("refused"), {
      userMessage: "Choose an owner from the Ops team.",
    });
  }
}

export const createSource = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    await assertOwnerInOps(supabase, input.owner_user_id);
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
    await assertOwnerInOps(supabase, input.owner_user_id);
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
