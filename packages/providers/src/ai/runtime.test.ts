import { describe, expect, it, vi } from "vitest";
import { aiConfig } from "./config";
import { NotGroundedError } from "./grounding";
import {
  AiUnavailableError,
  providerChain,
  runAiTask,
  type AiCacheKey,
  type AiCacheStore,
  type AiCallLog,
} from "./runtime";
import type { AiCallMeta } from "./types";

const config = aiConfig({
  AI_PROVIDER: "google",
  AI_FALLBACK_PROVIDER: "anthropic",
  AI_MODEL_STRUCTURED: "test-structured",
  AI_TIMEOUT_MS: "50",
  AI_MAX_RETRIES: "1",
});

function memoryCache(): AiCacheStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  const id = (k: AiCacheKey) => `${k.task}:${k.groundingHash}:${k.inputHash}`;

  return {
    entries,
    get: async (key) => entries.get(id(key)) ?? null,
    set: async (key, output) => {
      entries.set(id(key), output);
    },
  };
}

function memoryLog(): AiCallLog & { records: AiCallMeta[] } {
  const records: AiCallMeta[] = [];
  return { records, record: async (meta) => void records.push(meta) };
}

const base = {
  task: "intent_extract" as const,
  tier: "structured" as const,
  config,
  groundingHash: "g1",
  inputHash: "i1",
};

describe("runAiTask", () => {
  it("calls the provider and returns its value", async () => {
    const log = memoryLog();
    const result = await runAiTask<string>({
      ...base,
      log,
      attempt: async () => ({ value: "brief", tokensIn: 100, tokensOut: 20 }),
    });

    expect(result.value).toBe("brief");
    expect(result.cached).toBe(false);
    expect(result.meta.provider).toBe("google");
    expect(result.meta.model).toBe("test-structured");
    expect(log.records[0]).toMatchObject({ ok: true, tokensIn: 100, tokensOut: 20 });
  });

  it("serves a second identical question from cache without calling anyone", async () => {
    const cache = memoryCache();
    const attempt = vi.fn(async () => ({ value: "brief" }));

    await runAiTask<string>({ ...base, cache, attempt });
    const second = await runAiTask<string>({ ...base, cache, attempt });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    // A traveler who asks twice and gets two different briefs has learnt something true
    // about the system and stopped trusting it.
    expect(second.value).toBe("brief");
  });

  it("treats a different grounding as a different question", async () => {
    const cache = memoryCache();
    const attempt = vi.fn(async () => ({ value: "brief" }));

    await runAiTask<string>({ ...base, cache, attempt });
    await runAiTask<string>({ ...base, groundingHash: "g2", cache, attempt });

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("retries the primary provider once before giving up on it", async () => {
    const attempt = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce({ value: "brief" });

    const result = await runAiTask<string>({ ...base, attempt });

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(result.meta.isFallback).toBe(false);
  });

  it("moves to the fallback provider when the primary keeps failing", async () => {
    const seen: string[] = [];
    const result = await runAiTask<string>({
      ...base,
      attempt: async ({ provider }) => {
        seen.push(provider);
        if (provider === "google") throw new Error("down");
        return { value: "brief" };
      },
    });

    expect(seen).toEqual(["google", "google", "anthropic"]);
    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.isFallback).toBe(true);
  });

  it("does not retry the fallback — if it is failing too, a traveler is waiting", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("down");
    });

    await expect(runAiTask<string>({ ...base, attempt })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    // Two on the primary, one on the fallback.
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up on a grounding failure instead of asking again", async () => {
    // Retrying asks the same model the same question and invites the same invention.
    const attempt = vi.fn(async () => {
      throw new NotGroundedError(["05:15"]);
    });

    await expect(runAiTask<string>({ ...base, attempt })).rejects.toBeInstanceOf(NotGroundedError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("stops waiting at the timeout, even for a provider that ignores the signal", async () => {
    const attempt = async () =>
      new Promise<{ value: string }>((resolve) => {
        setTimeout(() => resolve({ value: "far too late" }), 5000);
      });

    const log = memoryLog();
    await expect(runAiTask<string>({ ...base, log, attempt })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(log.records.every((r) => r.errorCode === "timeout")).toBe(true);
  });

  it("passes an abort signal so a well-behaved SDK stops work it has started", async () => {
    let seenSignal: AbortSignal | undefined;
    await runAiTask<string>({
      ...base,
      attempt: async ({ signal }) => {
        seenSignal = signal;
        return { value: "brief" };
      },
    });

    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("logs every failure with a machine code, never a provider message", async () => {
    const log = memoryLog();
    const attempt = async () => {
      throw new Error("Request failed: your prompt was 'plan a trip to...'");
    };

    await expect(runAiTask<string>({ ...base, log, attempt })).rejects.toThrow();

    expect(log.records).toHaveLength(3);
    for (const record of log.records) {
      expect(record.ok).toBe(false);
      expect(record.errorCode).toBe("provider_error");
      // TRD §7.3.4: nothing here may quote the prompt back.
      expect(JSON.stringify(record)).not.toContain("plan a trip");
    }
  });

  it("keeps answering when the cache is broken", async () => {
    const brokenCache: AiCacheStore = {
      get: async () => {
        throw new Error("cache down");
      },
      set: async () => {
        throw new Error("cache down");
      },
    };

    const result = await runAiTask<string>({
      ...base,
      cache: brokenCache,
      attempt: async () => ({ value: "brief" }),
    });

    expect(result.value).toBe("brief");
  });

  it("keeps answering when the log is broken", async () => {
    const brokenLog: AiCallLog = {
      record: async () => {
        throw new Error("log down");
      },
    };

    const result = await runAiTask<string>({
      ...base,
      log: brokenLog,
      attempt: async () => ({ value: "brief" }),
    });

    expect(result.value).toBe("brief");
  });

  it("refuses up front when nothing is configured with credentials", async () => {
    const attempt = vi.fn(async () => ({ value: "brief" }));

    await expect(runAiTask<string>({ ...base, availableProviders: [], attempt })).rejects.toThrow(
      /No AI provider is configured/,
    );
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("providerChain", () => {
  it("puts the primary first and the fallback second", () => {
    expect(providerChain(config)).toEqual(["google", "anthropic"]);
  });

  it("drops a fallback that has no credentials, rather than failing on it", () => {
    expect(providerChain(config, ["google"])).toEqual(["google"]);
  });

  it("never lists the same provider twice", () => {
    const same = aiConfig({ AI_PROVIDER: "google", AI_FALLBACK_PROVIDER: "google" });
    expect(providerChain(same)).toEqual(["google"]);
  });

  it("honours an explicit request for no fallback", () => {
    const none = aiConfig({ AI_PROVIDER: "google", AI_FALLBACK_PROVIDER: "none" });
    expect(providerChain(none)).toEqual(["google"]);
  });
});

describe("aiConfig", () => {
  it("falls back to the TRD §7.1 defaults", () => {
    const defaults = aiConfig({});

    expect(defaults.provider).toBe("google");
    expect(defaults.fallbackProvider).toBe("anthropic");
    expect(defaults.models.structured).toBe("gemini-2.5-flash");
    expect(defaults.timeoutMs).toBe(12_000);
    expect(defaults.maxRetries).toBe(1);
  });

  it("ignores a nonsense provider rather than trying to use it", () => {
    expect(aiConfig({ AI_PROVIDER: "definitely-not-a-provider" }).provider).toBe("google");
  });

  it("ignores a nonsense timeout", () => {
    expect(aiConfig({ AI_TIMEOUT_MS: "-5" }).timeoutMs).toBe(12_000);
  });
});
