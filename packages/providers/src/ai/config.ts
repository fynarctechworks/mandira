import type { AiProviderName, ModelTier } from "./types";

/**
 * AI configuration (TRD §7.1), read from the environment.
 *
 * Names and defaults are verbatim from the TRD so that switching model or provider is an
 * env change rather than a code change — and so that what is running in production can be
 * read off the environment instead of inferred from the source.
 */

const DEFAULTS = {
  provider: "google" as AiProviderName,
  fallbackProvider: "anthropic" as AiProviderName,
  fast: "gemini-2.5-flash-lite",
  structured: "gemini-2.5-flash",
  quality: "claude-sonnet-4-6",
  embed: "text-embedding-004",
};

export type AiConfig = {
  provider: AiProviderName;
  fallbackProvider: AiProviderName | null;
  models: Record<ModelTier, string>;
  /** TRD §7.3.5: 12 s, one retry, then the fallback provider. */
  timeoutMs: number;
  maxRetries: number;
};

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  return {
    provider: providerName(env["AI_PROVIDER"]) ?? DEFAULTS.provider,
    // Explicitly set to "none" to run without one, e.g. in a test or a cost-capped
    // environment. Absent means the TRD default, not "no fallback".
    fallbackProvider:
      env["AI_FALLBACK_PROVIDER"] === "none"
        ? null
        : (providerName(env["AI_FALLBACK_PROVIDER"]) ?? DEFAULTS.fallbackProvider),
    models: {
      fast: env["AI_MODEL_FAST"] ?? DEFAULTS.fast,
      structured: env["AI_MODEL_STRUCTURED"] ?? DEFAULTS.structured,
      quality: env["AI_MODEL_QUALITY"] ?? DEFAULTS.quality,
      embed: env["AI_EMBED_MODEL"] ?? DEFAULTS.embed,
    },
    timeoutMs: positiveInt(env["AI_TIMEOUT_MS"]) ?? 12_000,
    maxRetries: positiveInt(env["AI_MAX_RETRIES"]) ?? 1,
  };
}

/**
 * Whether an AI call can be made at all.
 *
 * Callers check this rather than letting a request fail on a missing key: a feature that
 * needs an account nobody has set up yet should be absent, not broken.
 */
export function hasAiCredentials(
  provider: AiProviderName,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = {
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  }[provider];

  return Boolean(env[key]);
}

function providerName(value: string | undefined): AiProviderName | undefined {
  return value === "google" || value === "anthropic" || value === "openai" ? value : undefined;
}

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
