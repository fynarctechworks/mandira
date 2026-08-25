import type { AiConfig } from "./config";
import type { AiCallMeta, AiProviderName, AiResult, AiTask, ModelTier } from "./types";

/**
 * The storage the AI runtime needs, as ports rather than imports.
 *
 * `@mandhira/providers` is the only package allowed to import vendor SDKs, but that does
 * not make it the place to own database access. The app wires these to `ai_cache` and
 * `ai_calls`; a test wires them to a Map, and exercises the same code path.
 */
export type AiCacheStore = {
  get(key: AiCacheKey): Promise<unknown | null>;
  set(key: AiCacheKey, output: unknown, meta: { provider: string; model: string }): Promise<void>;
};

export type AiCacheKey = { task: AiTask; groundingHash: string; inputHash: string };

export type AiCallLog = {
  /** Must never throw into the request path: losing a log line is not worth losing a reply. */
  record(meta: AiCallMeta): Promise<void>;
};

export type AiAttempt<T> = (input: {
  provider: AiProviderName;
  model: string;
  signal: AbortSignal;
}) => Promise<{ value: T; tokensIn?: number; tokensOut?: number }>;

export class AiUnavailableError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.code = code;
  }
}

/**
 * Run one AI task with everything TRD §7.3 requires around it: cache, timeout, one retry,
 * fallback provider, and an anonymous log line either way.
 *
 * The order matters. Cache first, so a repeated question costs nothing and — more usefully
 * — returns the same answer, because a traveler who asks twice and gets two different
 * briefs has learnt something true about the system and stopped trusting it.
 */
export async function runAiTask<T>(options: {
  task: AiTask;
  tier: ModelTier;
  config: AiConfig;
  groundingHash: string;
  inputHash: string;
  attempt: AiAttempt<T>;
  cache?: AiCacheStore;
  log?: AiCallLog;
  /** Providers that actually have credentials, in preference order. */
  availableProviders?: AiProviderName[];
}): Promise<AiResult<T>> {
  const { task, tier, config, groundingHash, inputHash, attempt } = options;
  const model = config.models[tier];
  const key: AiCacheKey = { task, groundingHash, inputHash };

  const cached = await readCache(options.cache, key);
  if (cached !== null) {
    return {
      value: cached as T,
      cached: true,
      meta: {
        task,
        provider: config.provider,
        model,
        latencyMs: 0,
        groundingHash,
        ok: true,
        isFallback: false,
      },
    };
  }

  const chain = providerChain(config, options.availableProviders);
  if (chain.length === 0) {
    throw new AiUnavailableError(
      "no_provider",
      "No AI provider is configured with credentials, so this could not be worked out.",
    );
  }

  let lastError: unknown;

  for (const [index, provider] of chain.entries()) {
    const isFallback = index > 0;

    // One retry on the primary, none on the fallback: if the fallback is also failing the
    // problem is not transient, and a traveler is waiting.
    const attempts = isFallback ? 1 : config.maxRetries + 1;

    for (let tryIndex = 0; tryIndex < attempts; tryIndex += 1) {
      const startedAt = Date.now();

      try {
        const result = await withTimeout(
          (signal) => attempt({ provider, model, signal }),
          config.timeoutMs,
        );

        const meta: AiCallMeta = {
          task,
          provider,
          model,
          ...(result.tokensIn !== undefined ? { tokensIn: result.tokensIn } : {}),
          ...(result.tokensOut !== undefined ? { tokensOut: result.tokensOut } : {}),
          latencyMs: Date.now() - startedAt,
          groundingHash,
          ok: true,
          isFallback,
        };

        await Promise.all([
          writeCache(options.cache, key, result.value, { provider, model }),
          recordCall(options.log, meta),
        ]);

        return { value: result.value, cached: false, meta };
      } catch (error) {
        lastError = error;

        await recordCall(options.log, {
          task,
          provider,
          model,
          latencyMs: Date.now() - startedAt,
          groundingHash,
          ok: false,
          errorCode: errorCode(error),
          isFallback,
        });

        // A grounding failure is not a transient fault. Retrying asks the same model the
        // same question and invites the same invention; the caller falls back to a
        // deterministic template instead (TRD §5.5).
        if (errorCode(error) === "not_grounded") throw error;
      }
    }
  }

  throw new AiUnavailableError(
    errorCode(lastError),
    "The assistant could not work that out just now.",
  );
}

/**
 * The providers to try, in order, filtered to those that actually hold credentials.
 *
 * Filtering rather than failing means a deployment with only one key configured degrades
 * to no fallback instead of erroring on a fallback it was never able to use.
 */
export function providerChain(config: AiConfig, available?: AiProviderName[]): AiProviderName[] {
  const wanted = [config.provider, ...(config.fallbackProvider ? [config.fallbackProvider] : [])];
  const unique = [...new Set(wanted)];

  return available ? unique.filter((p) => available.includes(p)) : unique;
}

/**
 * TRD §7.3.5: 12 s.
 *
 * Raced rather than relying on the abort signal alone. The signal is passed so a
 * well-behaved SDK stops work it has started, but a provider that ignores it would
 * otherwise hang the request forever — and the deadline is the point.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiUnavailableError("timeout", "The assistant took too long."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Cache and log failures are swallowed: neither is worth failing a reply the caller has. */
async function readCache(store: AiCacheStore | undefined, key: AiCacheKey) {
  if (!store) return null;
  try {
    return await store.get(key);
  } catch {
    return null;
  }
}

async function writeCache(
  store: AiCacheStore | undefined,
  key: AiCacheKey,
  value: unknown,
  meta: { provider: string; model: string },
) {
  if (!store) return;
  try {
    await store.set(key, value, meta);
  } catch {
    // Deliberately silent.
  }
}

async function recordCall(log: AiCallLog | undefined, meta: AiCallMeta) {
  if (!log) return;
  try {
    await log.record(meta);
  } catch {
    // Deliberately silent.
  }
}

/** A short machine code — never the provider's message, which quotes the prompt back. */
export function errorCode(error: unknown): string {
  if (error instanceof AiUnavailableError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "provider_error";
}
