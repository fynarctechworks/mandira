import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import type { LanguageModel } from "ai";

import { candidateBlock, journeyBriefSchema } from "./brief-schema";
import { aiConfig, hasAiCredentials, type AiConfig } from "./config";
import { groundingHash, inputHash, keepKnownIds } from "./grounding";
import {
  groundKnowledgeClaims,
  knowledgeClaimsSchema,
  knowledgePrompt,
  MAX_CAPTURE_CHARS,
  MAX_TARGETS,
  type ExtractedKnowledge,
  type ExtractKnowledgeInput,
} from "./knowledge";
import { runAiTask, type AiCacheStore, type AiCallLog } from "./runtime";
import {
  groundTranslation,
  MAX_TRANSLATION_CHARS,
  type SuggestedTranslation,
  type SuggestTranslationInput,
} from "./translation";
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
  const stores = {
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.log ? { log: options.log } : {}),
  };
  const availableProviders = (["google", "anthropic", "openai"] as AiProviderName[]).filter((p) =>
    hasAiCredentials(p, env),
  );

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
        ...stores,
        availableProviders,
        attempt: async ({ provider, model, signal }) => {
          const generated = await generateObject({
            model: languageModel(provider, model, env),
            schema,
            system: SYSTEM_PROMPT,
            prompt: userPrompt(text, input, candidates),
            abortSignal: signal,
            temperature: 0,
          });

          return { value: toBrief(generated.object, candidates), ...usageOf(generated.usage) };
        },
      });

      return result;
    },

    async extractKnowledge(input: ExtractKnowledgeInput): Promise<AiResult<ExtractedKnowledge>> {
      const targets = input.targets.slice(0, MAX_TARGETS);
      const clipped = {
        ...input,
        targets,
        captureText: input.captureText.slice(0, MAX_CAPTURE_CHARS),
      };

      return runAiTask<ExtractedKnowledge>({
        task: "extract_knowledge",
        tier: "structured",
        config,
        groundingHash: groundingHash({
          candidates: targets.map((t) => ({ id: `${t.entityId}:${t.fields.join(",")}` })),
          locale: input.locale,
          extra: input.sourceName,
        }),
        inputHash: inputHash(clipped.captureText),
        ...stores,
        availableProviders,
        attempt: async ({ provider, model, signal }) => {
          const generated = await generateObject({
            model: languageModel(provider, model, env),
            schema: knowledgeClaimsSchema(targets),
            system: KNOWLEDGE_SYSTEM_PROMPT,
            prompt: knowledgePrompt(clipped),
            abortSignal: signal,
            temperature: 0,
          });

          return {
            value: groundKnowledgeClaims({
              proposed: generated.object.claims,
              captureText: clipped.captureText,
              targets,
              locale: input.locale,
            }),
            ...usageOf(generated.usage),
          };
        },
      });
    },

    async suggestTranslation(
      input: SuggestTranslationInput,
    ): Promise<AiResult<SuggestedTranslation>> {
      const text = input.text.slice(0, MAX_TRANSLATION_CHARS);

      return runAiTask<SuggestedTranslation>({
        task: "suggest_translation",
        tier: "fast",
        config,
        groundingHash: groundingHash({
          locale: input.to,
          extra: `${input.from}|${input.context ?? ""}`,
        }),
        inputHash: inputHash(text),
        ...stores,
        availableProviders,
        attempt: async ({ provider, model, signal }) => {
          const generated = await generateText({
            model: languageModel(provider, model, env),
            system: TRANSLATION_SYSTEM_PROMPT,
            prompt: [
              `Translate from locale "${input.from}" to locale "${input.to}".`,
              input.context ? `Where it appears: ${input.context}` : "",
              "",
              text,
            ]
              .filter(Boolean)
              .join("\n"),
            abortSignal: signal,
            temperature: 0,
          });

          return { value: groundTranslation(generated.text, text), ...usageOf(generated.usage) };
        },
      });
    },
  };
}

const KNOWLEDGE_SYSTEM_PROMPT = [
  "You read text published by a source and report what it states about specific fields of",
  "specific places and experiences on a pilgrimage planner.",
  "",
  "Rules:",
  "- Report only what the text states explicitly. Never infer, complete or convert a value.",
  "- Copy the excerpt verbatim from the source text: the exact sentence that says it.",
  "- Only use the entity ids and field names you are given.",
  "- Write times, dates and amounts exactly as the source writes them.",
  "- If the text says nothing about a field, report nothing for it.",
].join("\n");

const TRANSLATION_SYSTEM_PROMPT = [
  "You translate short interface and pilgrimage-information text for travelers in India.",
  "Keep every time, date, number and proper name exactly as written.",
  "Use plain, respectful, natural phrasing. Return only the translation.",
].join("\n");

function usageOf(
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
) {
  return {
    ...(usage?.inputTokens !== undefined ? { tokensIn: usage.inputTokens } : {}),
    ...(usage?.outputTokens !== undefined ? { tokensOut: usage.outputTokens } : {}),
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
