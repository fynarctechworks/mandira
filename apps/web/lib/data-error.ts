type QueryError = { code?: string; message: string };

/**
 * A Supabase read or write that did not complete — RLS, network, or the database itself.
 *
 * Distinct from "nothing there" on purpose: a lookup that failed must never be rendered as
 * a 404 or an empty state, because then a traveler is told something false and nobody is
 * told anything at all. The code and message are for server logs; the traveler sees the
 * route's boundary copy.
 */
export class DataUnavailableError extends Error {
  readonly source: string;
  readonly code: string | undefined;
  readonly detail: string;

  constructor(source: string, cause: QueryError) {
    super(`Data unavailable from ${source} (${cause.code || "no code"}): ${cause.message}`);
    this.name = "DataUnavailableError";
    this.source = source;
    this.code = cause.code;
    this.detail = cause.message;
  }
}

export function mustWrite(result: { error: QueryError | null }, source: string): void {
  if (result.error) throw new DataUnavailableError(source, result.error);
}

// Generic over the whole result: inferring from `data: T | null` collapses a single-row union to never.
export function mustMaybe<R extends { data: unknown; error: QueryError | null }>(
  result: R,
  source: string,
): NonNullable<R["data"]> | null {
  mustWrite(result, source);
  return (result.data ?? null) as NonNullable<R["data"]> | null;
}

export function mustList<T>(
  result: { data: T[] | null; error: QueryError | null },
  source: string,
): T[] {
  mustWrite(result, source);
  return result.data ?? [];
}
