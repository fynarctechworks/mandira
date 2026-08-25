import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";

import { candidateBlock, journeyBriefSchema } from "./brief-schema";
import { aiConfig, hasAiCredentials, type AiConfig } from "./config";
import { groundingHash, inputHash, keepKnownIds } from "./grounding";
import { runAiTask, type AiCacheStore, type AiCallLog } from "./runtime";
import type {
  AiProvider,
  AiProviderName,
  AiResult,
  ExtractedBrief,
  ExtractIntentInput,
} from "./types";

/** PRD-SEC: TRD §6.1 caps intent text at 1,000 characters. */
const MAX_INTENT_CHARS = 1000;
/** TRD §7.2 caps the candidate list at 200. */
const MAX_CANDIDATES = 200;

/**
 * The one concrete AiProvider (TRD §7.1), over the Vercel AI SDK.
 *
 * Model and provider are environment choices; this file holds no model names of its own.
 */
export function createVercelAiProvider(
  options: {
    config?: AiConfig;
    cache?: AiCacheStore;
    log?: AiCallLog;
    env?: NodeJS.ProcessEnv;
  } = {},
): AiProvider {
  const env = options.env ?? process.env;
  const config = options.config ?? aiConfig(env);

  return {
    name: config.provider,

    async extractIntent(input: ExtractIntentInput): Promise<AiResult<ExtractedBrief>> {
      const candidates = input.candidateExperiences.slice(0, MAX_CANDIDATES);
      const text = input.text.slice(0, MAX_INTENT_CHARS);
      const schema = journeyBriefSchema(candidates);

      const result = await runAiTask<ExtractedBrief>({
        task: "intent_extract",
        tier: "structured",
        config,
        groundingHash: groundingHash({
          candidates,
          locale: input.locale,
          ...(input.destinationId ? { destinationId: input.destinationId } : {}),
        }),
        inputHash: inputHash(text),
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.log ? { log: options.log } : {}),
        availableProviders: (["google", "anthropic", "openai"] as AiProviderName[]).filter((p) =>
          hasAiCredentials(p, env),
        ),
        attempt: async ({ provider, model, signal }) => {
          const generated = await generateObject({
            model: languageModel(provider, model, env),
            schema,
            system: SYSTEM_PROMPT,
            prompt: userPrompt(text, input, candidates),
            abortSignal: signal,
            temperature: 0,
          });

          return {
            value: toBrief(generated.object, candidates),
            ...(generated.usage?.inputTokens !== undefined
              ? { tokensIn: generated.usage.inputTokens }
              : {}),
            ...(generated.usage?.outputTokens !== undefined
              ? { tokensOut: generated.usage.outputTokens }
              : {}),
          };
        },
      });

      return result;
    },
  };
}

/**
 * Every rule here is also enforced in code. The prompt states them because a model that
 * understands the constraint produces better output inside it — not because stating them
 * is what makes them hold (TRD §7.3).
 */
const SYSTEM_PROMPT = [
  "You turn a traveler's own words into a structured Journey Brief for a pilgrimage planner.",
  "",
  "Rules:",
  "- Only use experience ids from the candidate list you are given. Never invent one.",
  "- Put an experience in mustDo ONLY if the traveler said they must do it. Never promote",
  "  something they merely mentioned, and never add one they did not name.",
  "- Anything you worked out rather than read must be marked suggested: true.",
  "- If the traveler named something that is not in the candidate list, put their words in",
  "  unmatched. Do not substitute the closest candidate for it.",
  "- If something is genuinely ambiguous, ask about it in unclear rather than guessing.",
].join("\n");

function userPrompt(
  text: string,
  input: ExtractIntentInput,
  candidates: ExtractIntentInput["candidateExperiences"],
): string {
  return [
    input.today ? `Today is ${input.today}.` : "",
    `The traveler is writing in locale "${input.locale}".`,
    "",
    "Candidate experiences (id, type, name) — the only ids you may use:",
    candidateBlock(candidates),
    "",
    "What the traveler wrote:",
    text,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Second layer on the id constraint (PRD-INT-005).
 *
 * The schema already restricts the model to the candidate ids. This checks that it did,
 * and moves anything else to `unmatched`, where the brief-review screen shows "we don't
 * have verified information about that yet" instead of a silently dropped request.
 */
function toBrief(
  object: ReturnType<ReturnType<typeof journeyBriefSchema>["parse"]>,
  candidates: ExtractIntentInput["candidateExperiences"],
): ExtractedBrief {
  const mustDo = keepKnownIds(object.mustDo, candidates);
  const wouldLike = keepKnownIds(object.wouldLike, candidates);

  return {
    ...(object.destination ? { destination: object.destination } : {}),
    ...(object.startDate
      ? { startDate: { value: object.startDate.value, suggested: object.startDate.suggested } }
      : {}),
    ...(object.dayCount
      ? { dayCount: { value: object.dayCount.value, suggested: object.dayCount.suggested } }
      : {}),
    travelers: object.travelers,
    mustDo: mustDo.kept,
    wouldLike: wouldLike.kept,
    fixedCommitments: object.fixedCommitments,
    ...(object.pace
      ? { pace: { value: object.pace.value, suggested: object.pace.suggested } }
      : {}),
    unmatched: [...object.unmatched, ...mustDo.rejected, ...wouldLike.rejected],
    unclear: object.unclear,
  };
}

/** Omitted rather than passed as undefined, so the SDK falls back to its own env lookup. */
function apiKey(value: string | undefined) {
  return value ? { apiKey: value } : {};
}

function languageModel(
  provider: AiProviderName,
  model: string,
  env: NodeJS.ProcessEnv,
): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI(apiKey(env["GOOGLE_GENERATIVE_AI_API_KEY"]))(model);
    case "anthropic":
      return createAnthropic(apiKey(env["ANTHROPIC_API_KEY"]))(model);
    case "openai":
      // Named in TRD §7.1 as a configurable option; no adapter is installed until something
      // actually selects it, rather than carrying a dependency nothing uses.
      throw new Error("AI_PROVIDER=openai is configured but no OpenAI adapter is installed.");
  }
}
