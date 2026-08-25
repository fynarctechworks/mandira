import { z } from "zod";
import type { CandidateExperience } from "./types";

/**
 * `JourneyBriefSchema` (TRD §7.2) — the shape the model must produce, built around the
 * candidate list rather than around a general idea of an experience.
 *
 * The experience-id field is a Zod enum over exactly the published ids, so the provider is
 * asked for a value from a closed set rather than asked politely to stay inside one. That
 * is the first of two layers: `keepKnownIds` in `grounding.ts` checks the result anyway,
 * because a schema enum is a request to the provider and the acceptance criterion is 100%
 * of hallucinated ids blocked (PRD-INT-005).
 */
export function journeyBriefSchema(candidates: CandidateExperience[]) {
  const experienceId = experienceIdSchema(candidates);

  const suggestible = <T extends z.ZodTypeAny>(value: T) =>
    z.object({
      value,
      // PRD-INT-003: anything the model worked out rather than read has to be labelled and
      // confirmed with a tap. A brief that quietly asserts an inference is a brief the
      // traveler cannot review.
      suggested: z.boolean().describe("true when inferred rather than stated by the user"),
    });

  return z.object({
    destination: z
      .object({
        text: z.string().describe("the destination as the user named it"),
        suggested: z.boolean(),
      })
      .optional(),

    startDate: suggestible(z.string().describe("YYYY-MM-DD")).optional(),
    dayCount: suggestible(z.number().int().min(1).max(30)).optional(),

    travelers: z
      .array(
        z.object({
          label: z.string().describe("how the user referred to them, e.g. 'Amma'"),
          mobility: z
            .enum(["full", "limited_walking", "wheelchair", "needs_rest_frequently"])
            .optional(),
          ageBand: z.enum(["child", "adult", "senior"]).optional(),
          suggested: z.boolean(),
        }),
      )
      .max(12)
      .describe("PRD-PLAN-010 caps a group at 12"),

    mustDo: z
      .array(z.object({ experienceId, suggested: z.boolean() }))
      .describe("ONLY experiences the user explicitly said they must do"),

    wouldLike: z.array(z.object({ experienceId, suggested: z.boolean() })),

    fixedCommitments: z.array(
      z.object({
        label: z.string(),
        at: z.string().optional().describe("ISO instant, if the user gave a time"),
        placeText: z.string().optional(),
        suggested: z.boolean(),
      }),
    ),

    pace: suggestible(z.enum(["relaxed", "balanced", "full"])).optional(),

    unmatched: z
      .array(z.string())
      .describe("things the user named that no candidate experience matches"),

    unclear: z
      .array(z.object({ question: z.string(), about: z.string().optional() }))
      .describe("ambiguities to ask the user about, only concerning candidate experiences"),
  });
}

/**
 * An empty candidate list has to stay unsatisfiable rather than fall back to a free string.
 *
 * `z.enum` needs at least one value, and the tempting fix — allowing any string when there
 * are no candidates — would turn the one hard constraint in this schema off exactly when
 * there is no published knowledge to check against.
 */
function experienceIdSchema(candidates: CandidateExperience[]) {
  const ids = candidates.map((c) => c.id);

  return ids.length > 0
    ? z.enum(ids as [string, ...string[]])
    : z.never({ error: "There are no published experiences to choose from." });
}

/**
 * The grounding block the model is given: the candidate list, and nothing else.
 *
 * Names come from the published views already resolved to the traveler's locale, so the
 * model never sees an unpublished entity — an id it cannot see is an id it cannot name.
 */
export function candidateBlock(candidates: CandidateExperience[]): string {
  return candidates.map((c) => `${c.id}\t${c.type}\t${c.name}`).join("\n");
}
