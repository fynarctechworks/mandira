import { z } from "zod";

import { extractClaims } from "./grounding";

/**
 * Knowledge extraction from a source capture (TRD §7.1 `extractKnowledge`, PRD F17).
 *
 * The model reads a page an operator registered and says what it claims about the fields
 * Mandhira tracks. Nothing it returns is a fact: every claim becomes a change candidate a
 * reviewer decides on (CLAUDE.md §5 — AI never writes to knowledge tables). What this file
 * controls is which claims are even allowed to reach that queue.
 */

/** One entity the capture may speak about, and the fields worth extracting for it. */
export type KnowledgeTarget = {
  entityTable: string;
  entityId: string;
  name: string;
  fields: string[];
};

export type ExtractedClaim = {
  entityTable: string;
  entityId: string;
  fieldName: string;
  /** What the source says, in its own words. */
  value: string;
  /** The sentence from the capture that says it, verbatim. */
  excerpt: string;
  locale: string;
  confidence: "high" | "medium" | "low";
};

export type RejectedClaim = {
  claim: Omit<ExtractedClaim, "entityTable" | "locale">;
  reason: "unknown_target" | "unknown_field" | "excerpt_not_in_source" | "value_not_in_excerpt";
};

export type ExtractKnowledgeInput = {
  captureText: string;
  sourceName: string;
  locale: string;
  targets: KnowledgeTarget[];
};

export type ExtractedKnowledge = { claims: ExtractedClaim[]; rejected: RejectedClaim[] };

/** A capture is a web page; past this the useful part is not getting any more useful. */
export const MAX_CAPTURE_CHARS = 20_000;
export const MAX_TARGETS = 50;

/**
 * The shape the model must produce. Entity ids and field names are enums over the targets,
 * so the provider is asked for values from a closed set; `groundKnowledgeClaims` then checks
 * the result anyway (the same two layers as intent extraction, TRD §7.2).
 */
export function knowledgeClaimsSchema(targets: KnowledgeTarget[]) {
  return z.object({
    claims: z
      .array(
        z.object({
          entityId: closedSet(targets.map((t) => t.entityId)),
          fieldName: closedSet(targets.flatMap((t) => t.fields)),
          value: z.string().min(1).max(2000).describe("what the source says, in its own words"),
          excerpt: z
            .string()
            .min(1)
            .max(1000)
            .describe("the exact sentence from the source text that says it, copied verbatim"),
          confidence: z.enum(["high", "medium", "low"]),
        }),
      )
      .max(100),
  });
}

/**
 * Keeps only claims that can be traced to the capture itself.
 *
 * - the entity and the field must be ones the caller offered;
 * - the excerpt must appear in the capture (ignoring case and whitespace), so the reviewer
 *   is shown words the source actually printed;
 * - every time, date, amount or quantity in the value must also appear in that excerpt, so a
 *   model cannot quote the right sentence and report a different time.
 */
export function groundKnowledgeClaims(input: {
  proposed: RejectedClaim["claim"][];
  captureText: string;
  targets: KnowledgeTarget[];
  locale: string;
}): ExtractedKnowledge {
  const source = normalise(input.captureText);
  const claims: ExtractedClaim[] = [];
  const rejected: RejectedClaim[] = [];

  for (const claim of input.proposed) {
    const target = input.targets.find((t) => t.entityId === claim.entityId);

    const reason: RejectedClaim["reason"] | null = !target
      ? "unknown_target"
      : !target.fields.includes(claim.fieldName)
        ? "unknown_field"
        : !source.includes(normalise(claim.excerpt))
          ? "excerpt_not_in_source"
          : !valueInExcerpt(claim.value, claim.excerpt)
            ? "value_not_in_excerpt"
            : null;

    if (reason || !target) {
      rejected.push({ claim, reason: reason ?? "unknown_target" });
      continue;
    }

    claims.push({ ...claim, entityTable: target.entityTable, locale: input.locale });
  }

  return { claims, rejected };
}

/** The capture, clipped, and the target list the model is told it may speak about. */
export function knowledgePrompt(input: ExtractKnowledgeInput): string {
  const targets = input.targets
    .slice(0, MAX_TARGETS)
    .map((t) => `${t.entityId}\t${t.entityTable}\t${t.name}\tfields: ${t.fields.join(", ")}`)
    .join("\n");

  return [
    `Source: ${input.sourceName}. Claims are recorded in locale "${input.locale}".`,
    "",
    "Entities you may make claims about (id, table, name, fields):",
    targets,
    "",
    "Source text:",
    input.captureText.slice(0, MAX_CAPTURE_CHARS),
  ].join("\n");
}

function valueInExcerpt(value: string, excerpt: string): boolean {
  const allowed = new Set(extractClaims(excerpt));
  return extractClaims(value).every((claim) => allowed.has(claim));
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function closedSet(values: string[]) {
  const unique = [...new Set(values)];
  return unique.length > 0
    ? z.enum(unique as [string, ...string[]])
    : z.never({ error: "There is nothing this capture may make claims about." });
}
