"use server";

import { i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Circuit write paths (PRD F19 circuit builder, PRD-OPS-CNT-002, OPS-REL-01).
 *
 * A circuit is destinations in the order a pilgrimage takes them. Travelers do not see
 * circuits yet — they arrive with multi-destination journeys (PRD phase 5) — and, as for every
 * other entity, `status` is not a field an editor sets from a form.
 */

const refuse = (userMessage: string) => Object.assign(new Error("refused"), { userMessage });

const circuitFields = {
  slug: z
    .string()
    .min(1, "A slug is required")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens"),
  name_i18n: i18nText.refine(
    (v) => Object.keys(v).length > 0,
    "Add a name in at least one language",
  ),
  description_i18n: i18nText.default({}),
};

const createSchema = z.object(circuitFields);
const updateSchema = z.object({ id: uuid, ...circuitFields });
const membersSchema = z.object({
  circuit_id: uuid,
  destination_ids: z.array(uuid).max(50, "A circuit can hold at most 50 destinations"),
});

export const createCircuit = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: createSchema,
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase
      .from("circuits")
      .insert(asRow(input))
      .select("id")
      .single();
    if (error) throw error;

    revalidatePath("/circuits");
    return { id: data.id };
  },
});

export const updateCircuit = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: updateSchema,
  handler: async ({ input, supabase }) => {
    const { id, ...row } = input;
    const { error } = await supabase.from("circuits").update(asRow(row)).eq("id", id);
    if (error) throw error;

    revalidatePath("/circuits");
    revalidatePath(`/circuits/${id}`);
    return { id };
  },
});

/**
 * The circuit's destinations, in order, replaced in one transaction (0051). As separate
 * deletes and inserts from here, the deletes need the admin-only hard delete and a reorder
 * would half-apply.
 */
export const setCircuitDestinations = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: membersSchema,
  handler: async ({ input, supabase }) => {
    const { error } = await supabase.rpc("set_circuit_destinations", {
      p_circuit_id: input.circuit_id,
      p_destination_ids: input.destination_ids,
    });
    if (error) {
      if (error.code === "23514" || error.code === "P0002") throw refuse(error.message);
      throw error;
    }

    revalidatePath("/circuits");
    revalidatePath(`/circuits/${input.circuit_id}`);
    return { count: input.destination_ids.length };
  },
});
