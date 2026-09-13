import type { CaptureProvider } from "@mandhira/providers";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * TEST-02: the fetch → store → detect → candidate seam, end to end through the real runner.
 *
 * The capture provider's SSRF guard refuses loopback addresses, correctly, so no test can point
 * the runner at a fixture server, and relaxing that guard is forbidden (CLAUDE.md §5). The
 * provider is injectable instead: these tests hand the runner a stub capture and an in-memory
 * database, and assert what reaches storage, the job row and `open_change_candidate`.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@mandhira/db/client/server", () => ({ createServiceRoleSupabase: () => state.db }));
vi.mock("./extraction", () => ({
  extractFromCapture: vi.fn(async () => ({ status: "not_configured" })),
}));

const { runIngestionForSource } = await import("./ingestion");

function fakeDb(seed: { tables: Record<string, Row[]>; files?: Record<string, string> }) {
  const tables: Record<string, Row[]> = { ingestion_jobs: [], source_captures: [], ...seed.tables };
  const files = new Map(Object.entries(seed.files ?? {}));
  const rpc = vi.fn(async (_name: string, _args: Row) => ({ data: null, error: null }));
  let nextId = 0;

  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: [string, unknown][] = [];
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let inserted: Row | null = null;
    let patch: Row | null = null;

    const matching = () => {
      let result = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
      if (order) {
        const { column, ascending } = order;
        result = [...result].sort(
          (a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1),
        );
      }
      return limit === null ? result : result.slice(0, limit);
    };

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        order = { column, ascending: options?.ascending !== false };
        return builder;
      },
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      insert: (row: Row) => {
        inserted = { id: `${table}-${++nextId}`, ...row };
        rows.push(inserted);
        return builder;
      },
      update: (next: Row) => {
        patch = next;
        return builder;
      },
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      single: async () => ({ data: inserted, error: null }),
      then: (resolve: (value: { data: Row[] | null; error: null }) => unknown) => {
        if (patch) {
          for (const row of matching()) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: matching(), error: null }).then(resolve);
      },
    };
    return builder;
  };

  const storage = {
    from: () => ({
      upload: async (path: string, text: string) => {
        files.set(path, text);
        return { error: null };
      },
      download: async (path: string) =>
        files.has(path)
          ? { data: { text: async () => files.get(path)! }, error: null }
          : { data: null, error: { message: "not found" } },
    }),
  };

  return { client: { from, rpc, storage }, tables, files, rpc };
}

function provider(result: Row): CaptureProvider {
  return { fetchCapture: vi.fn(async () => result) } as unknown as CaptureProvider;
}

const SOURCE = {
  id: "s1",
  name: "Temple trust notice board",
  url: "https://temple.example/timings",
  ingestion_method: "url_monitor",
  status: "active",
};

const BEFORE = "Darshan timings: 06:00 to 12:00. Dress code applies inside the sanctum.";
const AFTER = "Darshan timings: 07:00 to 12:00. Dress code applies inside the sanctum.";

const withPrevious = () =>
  fakeDb({
    tables: {
      sources: [SOURCE],
      source_captures: [
        {
          id: "c-old",
          source_id: "s1",
          content_hash: "hash-old",
          storage_path: "s1/hash-old.txt",
          captured_at: "2026-09-01T00:00:00Z",
        },
      ],
      trust_records: [
        {
          source_id: "s1",
          entity_table: "places",
          entity_id: "p1",
          field_name: "opening_schedule",
          evidence_excerpt: "Darshan timings: 06:00 to 12:00",
        },
      ],
    },
    files: { "s1/hash-old.txt": BEFORE },
  });

const capture = (text: string, contentHash: string) => ({
  ok: true,
  text,
  contentHash,
  capturedAt: "2026-09-13T00:00:00Z",
});

beforeEach(() => {
  state.db = null;
});

describe("runIngestionForSource", () => {
  it("opens a change candidate when text an operator verified disappears from the source", async () => {
    const db = withPrevious();
    state.db = db.client;

    const outcome = await runIngestionForSource(
      "s1",
      "manual",
      "op-1",
      provider(capture(AFTER, "hash-new")),
    );

    expect(outcome).toMatchObject({ status: "succeeded", unchanged: false, candidatesOpened: 1 });
    expect(db.files.get("s1/hash-new.txt")).toBe(AFTER);
    expect(
      db.tables["source_captures"]!.find((row) => row["id"] === outcome.captureId),
    ).toMatchObject({
      source_id: "s1",
      storage_path: "s1/hash-new.txt",
      content_hash: "hash-new",
    });
    expect(db.rpc).toHaveBeenCalledWith("open_change_candidate", {
      p_entity_table: "places",
      p_entity_id: "p1",
      p_field_name: "opening_schedule",
      p_source_id: "s1",
      p_capture_id: outcome.captureId,
      p_excerpt: "Darshan timings: 06:00 to 12:00",
    });
    expect(db.tables["ingestion_jobs"]![0]).toMatchObject({
      status: "succeeded",
      triggered_by: "op-1",
    });
  });

  it("records an unchanged page as a run, without storing a second copy or raising anything", async () => {
    const db = withPrevious();
    state.db = db.client;

    const outcome = await runIngestionForSource(
      "s1",
      "scheduled",
      null,
      provider(capture(BEFORE, "hash-old")),
    );

    expect(outcome).toMatchObject({ status: "succeeded", unchanged: true, captureId: null });
    expect(db.files.size).toBe(1);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("stores a source's first capture without inventing changes", async () => {
    const db = fakeDb({ tables: { sources: [SOURCE], trust_records: [] } });
    state.db = db.client;

    const outcome = await runIngestionForSource(
      "s1",
      "scheduled",
      null,
      provider(capture(AFTER, "hash-first")),
    );

    expect(outcome).toMatchObject({ status: "succeeded", candidatesOpened: 0 });
    expect(outcome.captureId).not.toBeNull();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("writes why a fetch failed onto the job, rather than losing it", async () => {
    const db = withPrevious();
    state.db = db.client;

    const outcome = await runIngestionForSource(
      "s1",
      "manual",
      "op-1",
      provider({ ok: false, reason: "blocked_address" }),
    );

    expect(outcome.status).not.toBe("succeeded");
    expect(outcome.error).toMatch(/Could not read the source \(blocked_address/);
    expect(db.tables["ingestion_jobs"]![0]!["status"]).not.toBe("running");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("never fetches a retired source", async () => {
    const db = fakeDb({ tables: { sources: [{ ...SOURCE, status: "retired" }] } });
    state.db = db.client;
    const stub = provider(capture(AFTER, "x"));

    const outcome = await runIngestionForSource("s1", "scheduled", null, stub);

    expect(outcome.error).toMatch(/retired/);
    expect(stub.fetchCapture).not.toHaveBeenCalled();
  });
});
