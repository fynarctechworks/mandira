/**
 * AiProvider (TRD §7.1) — the provider abstraction and the machinery TRD §7.3 requires
 * around every call: grounding checks in code, an anonymous log, a 24-hour cache, a
 * timeout, one retry, and a fallback provider.
 *
 * The concrete binding is `createVercelAiProvider`. Like the rest of this package it is
 * server-only: apps import it from a route handler or a server action, never from a
 * component (ARCHITECTURE §1, enforced by a no-restricted-imports rule).
 */

export type {
  AiProvider,
  AiProviderName,
  AiTask,
  AiCallMeta,
  AiResult,
  CandidateExperience,
  ExtractedBrief,
  ExtractIntentInput,
  ModelTier,
} from "./types";

export { aiConfig, hasAiCredentials, type AiConfig } from "./config";

export {
  assertGrounded,
  isGrounded,
  extractClaims,
  keepKnownIds,
  groundingHash,
  inputHash,
  NotGroundedError,
} from "./grounding";

export {
  runAiTask,
  providerChain,
  errorCode,
  AiUnavailableError,
  type AiAttempt,
  type AiCacheKey,
  type AiCacheStore,
  type AiCallLog,
} from "./runtime";

export { journeyBriefSchema, candidateBlock } from "./brief-schema";
export { createVercelAiProvider } from "./vercel";
