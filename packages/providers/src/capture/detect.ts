import { normaliseExcerpt } from "./normalise";

/**
 * Deciding which published fields a capture change touched (PRD-OPS-SRC-004).
 *
 * THE RULE, and the reason it is this one. PRD F17 asks for a candidate "when a monitored
 * source's capture diff touches an existing published field". Knowing which field a page
 * diff touched would normally mean AI extraction — a key this project does not have yet
 * (ACCT-04), and an inference this product would then have to trust.
 *
 * There is a deterministic answer already in the schema. `trust_records.evidence_excerpt`
 * holds the exact words an operator read when they verified a field, next to the source
 * they read them in. So:
 *
 *     A published field's evidence disappearing from its own source is a change candidate.
 *
 * No model, no guess at the new value. `new_value` stays null and the operator sees the
 * diff plus the excerpt that vanished — which is precisely what PRD-OPS-SRC-004's
 * acceptance describes ("with the excerpt highlighted"). When a key exists, extraction
 * proposes the new value on top of the same row rather than replacing this.
 *
 * What this deliberately does NOT do is raise a candidate for any diff at all. A page that
 * carries a rotating banner would then interrupt somebody every morning, and a queue that
 * cries wolf daily is abandoned inside a week — after which the real timing change sits
 * unread among fifty false ones.
 *
 * Pure, and no clock: this decides whether a person is interrupted.
 */

export type EvidenceRecord = {
  entityTable: string;
  entityId: string;
  /** Null means whole-entity trust, which no excerpt can meaningfully stand for. */
  fieldName: string | null;
  excerpt: string | null;
};

export type DetectedChange = {
  entityTable: string;
  entityId: string;
  fieldName: string;
  /** The excerpt that is no longer present, verbatim as the operator recorded it. */
  excerpt: string;
};

export type DetectionResult = {
  changes: DetectedChange[];
  /**
   * Fields that could not be checked, and why — surfaced in the UI rather than swallowed.
   * A queue implying full coverage it does not have is worse than one admitting the gap.
   */
  skipped: { entityTable: string; entityId: string; fieldName: string | null; reason: SkipReason }[];
};

export type SkipReason = "no_excerpt" | "whole_entity" | "excerpt_absent_before";

export function detectChangeCandidates(input: {
  /** The capture this run produced, already normalised. */
  currentText: string;
  /** The previous capture, or null on a source's first ever run. */
  previousText: string | null;
  /** Every trust record citing this source. */
  evidence: EvidenceRecord[];
}): DetectionResult {
  const { currentText, previousText, evidence } = input;

  const changes: DetectedChange[] = [];
  const skipped: DetectionResult["skipped"] = [];

  // Nothing to compare against on a first run. Storing the capture IS the work.
  if (previousText === null) return { changes, skipped };

  const currentHaystack = haystack(currentText);
  const previousHaystack = haystack(previousText);

  for (const record of evidence) {
    if (record.fieldName === null) {
      skipped.push({ ...ids(record), fieldName: null, reason: "whole_entity" });
      continue;
    }

    // Lower-cased to match `haystack` — see the note there on why case is ignored.
    const needle = normaliseExcerpt(record.excerpt ?? "").toLowerCase();
    if (needle.length === 0) {
      skipped.push({ ...ids(record), fieldName: record.fieldName, reason: "no_excerpt" });
      continue;
    }

    /*
     * If the excerpt was already absent from the PREVIOUS capture, its absence now says
     * nothing new — the page was reorganised at some point, or the excerpt was recorded
     * from a different page of the same source. Raising a candidate every cycle for that
     * is the noise this whole design exists to avoid.
     */
    if (!previousHaystack.includes(needle)) {
      skipped.push({ ...ids(record), fieldName: record.fieldName, reason: "excerpt_absent_before" });
      continue;
    }

    if (!currentHaystack.includes(needle)) {
      changes.push({ ...ids(record), fieldName: record.fieldName, excerpt: record.excerpt! });
    }
  }

  return { changes, skipped };
}

/**
 * The capture flattened to one line and lower-cased.
 *
 * Flattened because an excerpt spanning two lines in the source is one line to the person
 * who copied it; lower-cased because a page changing "Evening Aarti" to "Evening aarti" is
 * a style edit, and interrupting somebody over it teaches them to stop reading the queue.
 */
function haystack(text: string): string {
  return text.replace(/\n/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function ids(record: EvidenceRecord): { entityTable: string; entityId: string } {
  return { entityTable: record.entityTable, entityId: record.entityId };
}
