/**
 * The Verify queue's ordering and filters (O11, PRD-OPS-WF-002). Pure, so the queue's
 * sense of "worst first" is tested rather than trusted.
 */

export type VerifyTrust = {
  id: string;
  field_name: string | null;
  source_id: string | null;
  verification_status: string;
  verified_at: string | null;
  valid_until: string | null;
  evidence_url: string | null;
  evidence_excerpt: string | null;
  conflict_flag: boolean;
  freshness: string;
  confidence: string;
};

export type VerifyRow = {
  key: string;
  entityTable: string;
  entityId: string;
  fieldName: string | null;
  fieldLabel: string;
  entityLabel: string;
  entityStatus: string;
  editorHref: string | null;
  /** The critical field a trust panel can record against, when this table has one. */
  panelField: { field: string | null; label: string; why: string } | null;
  trust: VerifyTrust | null;
  sourceName: string | null;
  sourceTier: string | null;
  task: {
    id: string;
    status: string;
    assignedTo: string | null;
    notes: string | null;
    createdAt: string;
  } | null;
};

export type VerifyFilter = "all" | "mine" | "unclaimed";

const STATUS_RANK: Record<string, number> = {
  disputed: 0,
  unverified: 1,
  ai_extracted: 2,
  human_reviewed: 3,
  verified: 4,
};

const FRESHNESS_RANK: Record<string, number> = { stale: 0, aging: 1, fresh: 2 };

/**
 * Worst first: a disagreement, then a field whose source changed under it, then what
 * travelers can already see, then the weakest status, the stalest, the longest unchecked.
 */
export function rankVerifyRows(rows: VerifyRow[]): VerifyRow[] {
  const score = (row: VerifyRow): number[] => [
    row.trust?.conflict_flag ? 0 : 1,
    row.task ? 0 : 1,
    row.entityStatus === "published" ? 0 : 1,
    STATUS_RANK[row.trust?.verification_status ?? "unverified"] ?? 1,
    FRESHNESS_RANK[row.trust?.freshness ?? "stale"] ?? 0,
    row.trust?.verified_at ? Date.parse(row.trust.verified_at) : 0,
  ];

  return [...rows].sort((a, b) => {
    const left = score(a);
    const right = score(b);
    for (let i = 0; i < left.length; i++) {
      const diff = (left[i] ?? 0) - (right[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.key.localeCompare(b.key);
  });
}

export function filterVerifyRows(
  rows: VerifyRow[],
  filter: VerifyFilter,
  userId: string,
): VerifyRow[] {
  switch (filter) {
    case "mine":
      return rows.filter((row) => row.task?.assignedTo === userId);
    case "unclaimed":
      return rows.filter((row) => !row.task?.assignedTo);
    default:
      return rows;
  }
}

/** True once the field's trust record would let a verify task close. */
export function clearsVerification(status: string | null | undefined): boolean {
  return status === "human_reviewed" || status === "verified";
}
