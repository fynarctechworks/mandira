import { describe, expect, it } from "vitest";
import {
  clearsVerification,
  filterVerifyRows,
  rankVerifyRows,
  type VerifyRow,
  type VerifyTrust,
} from "./verify-rows";

function trust(overrides: Partial<VerifyTrust> = {}): VerifyTrust {
  return {
    id: "t",
    field_name: "opening_schedule",
    source_id: null,
    verification_status: "human_reviewed",
    verified_at: "2026-09-01T00:00:00Z",
    valid_until: null,
    evidence_url: null,
    evidence_excerpt: null,
    conflict_flag: false,
    needs_reverification: false,
    freshness: "fresh",
    confidence: "medium",
    ...overrides,
  };
}

function row(key: string, overrides: Partial<VerifyRow> = {}): VerifyRow {
  return {
    key,
    entityTable: "places",
    entityId: key,
    fieldName: "opening_schedule",
    fieldLabel: "Opening hours",
    entityLabel: key,
    entityStatus: "in_review",
    editorHref: `/places/${key}`,
    panelField: null,
    trust: trust(),
    sourceName: null,
    sourceTier: null,
    task: null,
    ...overrides,
  };
}

const task = (assignedTo: string | null) => ({
  id: "task",
  status: assignedTo ? "in_progress" : "open",
  assignedTo,
  notes: null,
  createdAt: "2026-09-10T00:00:00Z",
});

describe("rankVerifyRows", () => {
  it("puts a disagreement ahead of everything", () => {
    const ranked = rankVerifyRows([
      row("published", { entityStatus: "published" }),
      row("conflict", { trust: trust({ conflict_flag: true }) }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["conflict", "published"]);
  });

  it("puts a field whose source changed ahead of plain gaps", () => {
    const ranked = rankVerifyRows([row("plain"), row("changed", { task: task(null) })]);
    expect(ranked[0]?.key).toBe("changed");
  });

  it("puts a published value edited since it was verified near the top", () => {
    // Travelers are reading words nobody has checked, which is worse than a gap nobody
    // has filled yet.
    const ranked = rankVerifyRows([
      row("gap", { task: task(null) }),
      row("changed", { trust: trust({ needs_reverification: true }) }),
    ]);
    expect(ranked[0]?.key).toBe("changed");
  });

  it("prefers what travelers can already see", () => {
    const ranked = rankVerifyRows([row("draft"), row("live", { entityStatus: "published" })]);
    expect(ranked[0]?.key).toBe("live");
  });

  it("orders by weakest status, then stalest, then longest unchecked", () => {
    const ranked = rankVerifyRows([
      row("reviewed-fresh"),
      row("reviewed-stale", { trust: trust({ freshness: "stale" }) }),
      row("unverified", { trust: trust({ verification_status: "unverified" }) }),
      row("missing", { trust: null }),
      row("reviewed-older", { trust: trust({ verified_at: "2026-01-01T00:00:00Z" }) }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual([
      "missing",
      "unverified",
      "reviewed-stale",
      "reviewed-older",
      "reviewed-fresh",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [row("b"), row("a", { entityStatus: "published" })];
    rankVerifyRows(input);
    expect(input.map((r) => r.key)).toEqual(["b", "a"]);
  });
});

describe("filterVerifyRows", () => {
  const rows = [
    row("mine", { task: task("me") }),
    row("theirs", { task: task("them") }),
    row("free"),
  ];

  it("shows my claims, or what nobody has claimed", () => {
    expect(filterVerifyRows(rows, "mine", "me").map((r) => r.key)).toEqual(["mine"]);
    expect(filterVerifyRows(rows, "unclaimed", "me").map((r) => r.key)).toEqual(["free"]);
    expect(filterVerifyRows(rows, "all", "me")).toHaveLength(3);
  });
});

describe("clearsVerification", () => {
  it("accepts only a person's review or a verification", () => {
    expect(clearsVerification("verified")).toBe(true);
    expect(clearsVerification("human_reviewed")).toBe(true);
    expect(clearsVerification("disputed")).toBe(false);
    expect(clearsVerification(null)).toBe(false);
  });
});
