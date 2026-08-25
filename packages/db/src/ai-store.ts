import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types";

/**
 * `ai_cache` and `ai_calls`, wired to the ports `@mandhira/providers` declares (TRD §7.3).
 *
 * The provider package owns the AI behaviour and this package owns the database, so the
 * two meet here rather than either importing the other. Both tables are service-role only
 * (0012), so this needs a service-role client.
 */

type AiTask = Database["public"]["Enums"]["ai_task_enum"];

type CacheKey = { task: AiTask; groundingHash: string; inputHash: string };

type CallMeta = {
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

export function createAiCacheStore(supabase: SupabaseClient<Database>) {
  return {
    async get(key: CacheKey): Promise<unknown | null> {
      const { data, error } = await supabase
        .from("ai_cache")
        .select("output, expires_at")
        .eq("task", key.task)
        .eq("grounding_hash", key.groundingHash)
        .eq("input_hash", key.inputHash)
        .maybeSingle();

      if (error || !data) return null;

      // Expiry is checked on read as well as pruned on a schedule. The prune job could be
      // late, or not yet wired in an environment, and serving a day-old answer about a
      // darshan timing is exactly the failure the 24-hour limit exists to prevent.
      if (new Date(data.expires_at).getTime() <= Date.now()) return null;

      return data.output;
    },

    async set(key: CacheKey, output: unknown, meta: { provider: string; model: string }) {
      await supabase.from("ai_cache").upsert(
        {
          task: key.task,
          grounding_hash: key.groundingHash,
          input_hash: key.inputHash,
          output: output as Database["public"]["Tables"]["ai_cache"]["Insert"]["output"],
          provider: meta.provider,
          model: meta.model,
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: "task,grounding_hash,input_hash" },
      );
    },
  };
}

/**
 * The AI call log (TRD §7.3.4).
 *
 * Every field written here is deliberately non-identifying: no user, no session, no prompt
 * and no output. What goes in is what answers "what is this costing and how often does it
 * fail" — and nothing that answers "who asked what".
 */
export function createAiCallLog(supabase: SupabaseClient<Database>) {
  return {
    async record(meta: CallMeta) {
      await supabase.from("ai_calls").insert({
        task: meta.task,
        provider: meta.provider,
        model: meta.model,
        tokens_in: meta.tokensIn ?? null,
        tokens_out: meta.tokensOut ?? null,
        latency_ms: meta.latencyMs,
        grounding_hash: meta.groundingHash,
        ok: meta.ok,
        error_code: meta.errorCode ?? null,
        is_fallback: meta.isFallback,
      });
    },
  };
}
