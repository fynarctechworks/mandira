/**
 * AiProvider (TRD §7.1).
 *
 * One interface over the Vercel AI SDK; the concrete model is an environment choice, not a
 * code change. Every method takes its grounding explicitly — nothing here reaches for
 * knowledge on its own, because a model that can fetch its own facts cannot be constrained
 * to the published ones (TRD §7.3.1).
 */

export type AiTask =
  | "intent_extract"
  | "explain"
  | "search_query"
  | "conversational_plan"
  | "extract_knowledge"
  | "detect_changes"
  | "contradiction_check"
  | "suggest_translation"
  | "classify"
  | "embed";

/** TRD §7.1 model tiers. Which concrete model each maps to is env configuration. */
export type ModelTier = "fast" | "structured" | "quality" | "embed";

export type AiProviderName = "google" | "anthropic" | "openai";

/**
 * One candidate the model is allowed to name (TRD §7.2).
 *
 * The list comes from the published views, so an unpublished or unverified experience is
 * not merely discouraged — it is absent from the vocabulary the model is given.
 */
export type CandidateExperience = {
  id: string;
  name: string;
  type: string;
};

export type AiCallMeta = {
  task: AiTask;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  groundingHash: string;
  ok: boolean;
  errorCode?: string;
  isFallback: boolean;
};

/** What a caller gets back: the value, plus what it cost and where it came from. */
export type AiResult<T> = {
  value: T;
  meta: AiCallMeta;
  /** True when this came from `ai_cache` and no provider was called. */
  cached: boolean;
};

export type ExtractIntentInput = {
  text: string;
  locale: string;
  /** Max 200, from `v_published_experiences` (TRD §7.2). */
  candidateExperiences: CandidateExperience[];
  destinationId?: string;
  today?: string;
};

export type AiProvider = {
  readonly name: AiProviderName;
  /** F3: natural language → a Journey Brief the traveler reviews before anything is built. */
  extractIntent(input: ExtractIntentInput): Promise<AiResult<ExtractedBrief>>;
};

/**
 * The AI's proposal, not a journey.
 *
 * Everything here is reviewed and confirmed by the traveler before `buildInitialJourney`
 * sees it (PRD F3). `suggested` marks a value the model inferred rather than read, so the
 * brief-review screen can label it and require a tap — PRD-INT-003.
 */
export type ExtractedBrief = {
  destination?: {
    id?: string | undefined;
    text?: string | undefined;
    suggested?: boolean | undefined;
  };
  startDate?: { value: string; suggested?: boolean };
  dayCount?: { value: number; suggested?: boolean };
  /*
   * The optional fields below are written `| undefined` on purpose. This shape comes
   * straight out of a Zod parse of the model's reply, where "absent" and "present but
   * undefined" are the same thing; under `exactOptionalPropertyTypes` the workspace would
   * otherwise reject the parsed object and invite a cast that hides the difference.
   */
  travelers: {
    label: string;
    mobility?: "full" | "limited_walking" | "wheelchair" | "needs_rest_frequently" | undefined;
    ageBand?: ("child" | "adult" | "senior") | undefined;
    suggested?: boolean | undefined;
  }[];
  mustDo: { experienceId: string; suggested?: boolean }[];
  wouldLike: { experienceId: string; suggested?: boolean }[];
  fixedCommitments: {
    label: string;
    at?: string | undefined;
    placeText?: string | undefined;
    suggested?: boolean | undefined;
  }[];
  pace?: { value: "relaxed" | "balanced" | "full"; suggested?: boolean };
  /** Things the traveler named that no published experience matches (PRD-INT-005). */
  unmatched: string[];
  /** Ambiguities to put in front of the traveler (PRD-INT-004). */
  unclear: { question: string; about?: string | undefined }[];
};
