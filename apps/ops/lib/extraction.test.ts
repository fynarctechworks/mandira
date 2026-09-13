import { AiUnavailableError, type AiProvider } from "@mandhira/providers";
import { describe, expect, it, vi } from "vitest";

import { extractFromCapture } from "./extraction";

type Row = Record<string, unknown>;

/** Just the query shapes extraction uses: trust records by source, names by id, one RPC. */
function fakeClient(tables: Record<string, Row[]>, rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => rpcResult);

  const from = (table: string) => {
    let rows = tables[table] ?? [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      limit: () => builder,
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };

  return { client: { from, rpc } as never, rpc };
}

const trust = [
  { source_id: "s1", entity_table: "places", entity_id: "p1", field_name: "dress_code_i18n" },
  { source_id: "s2", entity_table: "places", entity_id: "p9", field_name: "opening_schedule" },
];

const meta = {
  task: "extract_knowledge" as const,
  provider: "google",
  model: "gemini-test",
  latencyMs: 1,
  groundingHash: "g",
  ok: true,
  isFallback: false,
};

function providerWith(extractKnowledge: AiProvider["extractKnowledge"]): AiProvider {
  return {
    name: "google",
    extractIntent: vi.fn(),
    extractKnowledge,
    suggestTranslation: vi.fn(),
  } as unknown as AiProvider;
}

const base = { captureId: "c1", sourceId: "s1", sourceName: "Temple trust", captureText: "..." };

describe("extractFromCapture", () => {
  it("does nothing when no model is configured", async () => {
    const { client, rpc } = fakeClient({ trust_records: trust }, { data: null, error: null });
    await expect(
      extractFromCapture({ ...base, supabase: client, env: {} as NodeJS.ProcessEnv }),
    ).resolves.toEqual({
      status: "not_configured",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not ask the model about a source that vouches for nothing", async () => {
    const extract = vi.fn();
    const { client } = fakeClient({ trust_records: [] }, { data: null, error: null });

    await expect(
      extractFromCapture({ ...base, supabase: client, provider: providerWith(extract) }),
    ).resolves.toEqual({ status: "no_targets" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("asks only about this source's entities and records the grounded claims", async () => {
    const extract = vi.fn(async () => ({
      cached: false,
      meta,
      value: {
        claims: [
          {
            entityTable: "places",
            entityId: "p1",
            fieldName: "closure_rules_i18n",
            value: "Closed on Mondays",
            excerpt: "Closed on Mondays.",
            locale: "en",
            confidence: "high" as const,
          },
        ],
        rejected: [
          {
            claim: {
              entityId: "p1",
              fieldName: "opening_schedule",
              value: "6am",
              excerpt: "invented",
              confidence: "low" as const,
            },
            reason: "excerpt_not_in_source" as const,
          },
        ],
      },
    }));
    const { client, rpc } = fakeClient(
      {
        trust_records: trust,
        places: [{ id: "p1", name_i18n: { en: "Main shrine" } }],
      },
      { data: { candidates: 1, conflicts: 1, skipped: 0 }, error: null },
    );

    const outcome = await extractFromCapture({
      ...base,
      supabase: client,
      provider: providerWith(extract),
    });

    expect(outcome).toEqual({
      status: "recorded",
      candidates: 1,
      conflicts: 1,
      skipped: 0,
      rejected: 1,
    });

    const [request] = extract.mock.calls[0] as unknown as [{ targets: unknown[] }];
    expect(request.targets).toEqual([
      {
        entityTable: "places",
        entityId: "p1",
        name: "Main shrine",
        fields: expect.arrayContaining([
          "dress_code_i18n",
          "opening_schedule",
          "closure_rules_i18n",
          "entry_requirements_i18n",
        ]),
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("record_extraction", {
      p_capture_id: "c1",
      p_provider: "google",
      p_model: "gemini-test",
      p_claims: [
        {
          entity_table: "places",
          entity_id: "p1",
          field_name: "closure_rules_i18n",
          value: "Closed on Mondays",
          excerpt: "Closed on Mondays.",
          locale: "en",
          confidence: "high",
        },
      ],
    });
  });

  it("reports an unavailable model instead of failing the ingestion run", async () => {
    const { client } = fakeClient({ trust_records: trust }, { data: null, error: null });
    const provider = providerWith(async () => {
      throw new AiUnavailableError("timeout", "slow");
    });

    await expect(extractFromCapture({ ...base, supabase: client, provider })).resolves.toEqual({
      status: "unavailable",
      code: "timeout",
    });
  });
});
