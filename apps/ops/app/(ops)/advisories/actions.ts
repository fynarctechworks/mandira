"use server";

import { i18nText, uuid } from "@mandhira/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { opsAction } from "@/lib/action";

/**
 * Advisories (O19, PRD F20): destination-level notices with a severity and a window.
 *
 * `status` is absent from these schemas, as on every editor: an advisory reaches travelers
 * only through the publish gate. Roles follow the knowledge-table policies in 0008.
 */

const advisoryFields = {
  destination_id: uuid,
  title_i18n: i18nText.refine(
    (v) => Object.keys(v).length > 0,
    "Add a title in at least one language",
  ),
  body_i18n: i18nText.default({}),
  severity: z.enum(["info", "caution", "important"]),
  starts_at: z.iso.datetime({ offset: true }).nullable(),
  ends_at: z.iso.datetime({ offset: true }).nullable(),
  source_id: uuid.nullable(),
};

const inOrder = (v: { starts_at: string | null; ends_at: string | null }) =>
  !v.starts_at || !v.ends_at || Date.parse(v.starts_at) <= Date.parse(v.ends_at);
const orderMessage = { message: "The end has to be after the start", path: ["ends_at"] };

export const createAdvisory = opsAction({
  roles: ["researcher", "editor", "admin"],
  input: z.object(advisoryFields).refine(inOrder, orderMessage),
  handler: async ({ input, supabase }) => {
    const { data, error } = await supabase.from("advisories").insert(input).select("id").single();
    if (error) throw error;

    revalidatePath("/advisories");
    return { id: data.id };
  },
});

export const updateAdvisory = opsAction({
  roles: ["researcher", "editor", "approver", "admin"],
  input: z.object({ id: uuid, ...advisoryFields }).refine(inOrder, orderMessage),
  handler: async ({ input, supabase }) => {
    const { id, ...fields } = input;
    const { error } = await supabase.from("advisories").update(fields).eq("id", id);
    if (error) throw error;

    revalidatePath("/advisories");
    revalidatePath(`/advisories/${id}`);
    return { id };
  },
});
