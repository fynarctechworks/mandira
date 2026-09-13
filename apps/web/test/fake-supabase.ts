/**
 * A stand-in for the request-scoped Supabase client, for route and lib unit tests.
 *
 * Every query chain is accepted and recorded; awaiting it resolves to the result queued for
 * its table (or RPC). A table given an array answers each `from()` call with the next entry,
 * and keeps answering with the last one, so a route that reads the same table twice can be
 * told two different things.
 */
export type QueryResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

export type RecordedCall = { table: string; method: string; args: unknown[] };

export function fakeSupabase(options: {
  user?: { id: string; email?: string } | null;
  tables?: Record<string, QueryResult | QueryResult[]>;
  rpc?: Record<string, QueryResult>;
}) {
  const calls: RecordedCall[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const queues = new Map(
    Object.entries(options.tables ?? {}).map(([table, value]) => [
      table,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );

  const next = (table: string): QueryResult => {
    const queue = queues.get(table);
    if (!queue || queue.length === 0) return { data: [], error: null };
    return queue.length > 1 ? queue.shift()! : queue[0]!;
  };

  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user ?? null }, error: null }),
    },
    from(table: string) {
      const result = next(table);
      const chain: object = new Proxy(
        {},
        {
          get: (_, method) => {
            if (method === "then") {
              return (
                resolve: (value: QueryResult) => unknown,
                reject: (reason: unknown) => unknown,
              ) => Promise.resolve(result).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              calls.push({ table, method: String(method), args });
              return chain;
            };
          },
        },
      );
      return chain;
    },
    rpc: async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      return options.rpc?.[name] ?? { data: null, error: null };
    },
  };

  return { client, calls, rpcCalls };
}

/** The service-role client `withApi` rate-limits through: every window allows the call. */
export function openRateLimiter() {
  return {
    rpc: async () => ({
      data: [
        { allowed: true, remaining: 99, reset_at: new Date(Date.now() + 60_000).toISOString() },
      ],
      error: null,
    }),
  };
}

export const SIGNED_IN = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "pilgrim@mandhira.local",
};
