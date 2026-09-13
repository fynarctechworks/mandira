import { aiConfig, hasAiCredentials } from "./config";

/**
 * Whether any configured provider — primary or fallback — holds a key.
 *
 * Features ask this before offering an AI path at all, so a deployment without keys shows
 * the non-AI path (the structured form, manual review) rather than an option that fails.
 */
export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const config = aiConfig(env);
  return (
    hasAiCredentials(config.provider, env) ||
    (config.fallbackProvider !== null && hasAiCredentials(config.fallbackProvider, env))
  );
}
