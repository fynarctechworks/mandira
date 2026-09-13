"use server";

import { uuid } from "@mandhira/db";
import { getOpsRoles } from "@mandhira/db/client/roles";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asRow, opsAction } from "@/lib/action";

/**
 * Trust records on critical fields (OPS-EDIT-09, PRD-KNOW-002).
 *
 * This is what makes anything publishable: a critical field with no trust record, or one
 * below `human_reviewed`, keeps its whole entity invisible to travelers (D-030).
 *
 * `freshness` and `confidence` are NOT written here — the database derives them from the
 * tier, status, dates and flags (0002). One definition, and it is the one the traveler's
 * badge reads.
 */

const verificationStatus = z.enum([
  "unverified",
  "ai_extracted",
  "human_reviewed",
  "verified",
  "disputed",
]);

const trustSchema = z
  .object({
    entity_table: z.enum(["places", "experiences", "availability_rules", "transport_connections"]),
    entity_id: uuid,
    /** null = whole-entity trust (availability rules). */
    field_name: z.string().min(1).nullable(),
    source_id: uuid.nullable(),
    verification_status: verificationStatus,
    verified_at: z.string().datetime({ offset: true }).nullish(),
    valid_until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .nullish(),
    evidence_url: z.string().url("Enter a full URL").nullish().or(z.literal("")),
    evidence_excerpt: z.string().max(2000).nullish(),
    conflict_flag: z.boolean().default(false),
  })
  .refine(
    // "Verified" without a source is a claim nobody can check. PRD F18 has the verifier
    // attach source and evidence as part of the same action.
    (v) => v.verification_status !== "verified" || v.source_id != null,
    { message: "Choose the source this was verified against", path: ["source_id"] },
  );

/** Which roles may move a field to each status (PRD F18 role table). */
const STATUS_ROLES: Record<string, readonly string[]> = {
  unverified: ["researcher", "reviewer", "verifier", "editor", "admin"],
  ai_extracted: ["researcher", "editor", "admin"],
  human_reviewed: ["reviewer", "verifier", "editor", "admin"],
  verified: ["verifier", "approver", "admin"],
  disputed: ["reviewer", "verifier", "editor", "admin"],
};

export const saveTrustRecord = opsAction({
  roles: ["researcher", "reviewer", "verifier", "editor", "approver", "admin"],
  input: trustSchema,
  handler: async ({ input, supabase }) => {
    /*
     * Status-specific role check, on top of the action's broad gate.
     *
     * PRD F18 separates review from verification: a reviewer accepts a draft
     * (→ human_reviewed), a verifier confirms it against a T1/T2 source (→ verified).
     * Letting any Ops role set `verified` would collapse that distinction, and `verified`
     * is precisely the status that produces a high-confidence badge for travelers.
     */
    const held = await getOpsRoles(supabase);
    const allowed = STATUS_ROLES[input.verification_status] ?? [];
    if (!held.some((role) => allowed.includes(role))) {
      throw Object.assign(new Error("role"), { code: "ROLE_FOR_STATUS" });
    }

    const record = {
      entity_table: input.entity_table,
      entity_id: input.entity_id,
      field_name: input.field_name,
      source_id: input.source_id,
      verification_status: input.verification_status,
      // Stamp the verification time automatically when moving to verified and none was
      // given: an operator should not have to remember to record "now".
      verified_at:
        input.verified_at ??
        (input.verification_status === "verified" ? new Date().toISOString() : null),
      valid_until: input.valid_until || null,
      evidence_url: input.evidence_url || null,
      evidence_excerpt: input.evidence_excerpt || null,
      conflict_flag: input.conflict_flag,
      // Denormalised so the derivation trigger can read the tier without a join.
      source_tier: input.source_id
        ? ((await supabase.from("sources").select("tier").eq("id", input.source_id).maybeSingle())
            .data?.tier ?? null)
        : null,
    };

    const { data, error } = await supabase
      .from("trust_records")
      .upsert(asRow(record), { onConflict: "entity_table,entity_id,field_name" })
      .select("id, freshness, confidence")
      .single();
    if (error) throw error;

    revalidatePath("/places");
    revalidatePath("/experiences");
    return {
      id: data.id,
      freshness: data.freshness,
      confidence: data.confidence,
    };
  },
});
