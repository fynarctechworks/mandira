import { labelOf } from "./entities";
import { humanLabel, inSentence } from "./labels";

/**
 * Naming what is waiting to be published, for all eight publishable tables (0032). Pure, so
 * a row with no name column still reads as something an approver recognises.
 */

export type CandidateSource = Record<string, unknown> & { id: string };

export function candidateLabel(
  table: string,
  row: CandidateSource,
  placeNames: ReadonlyMap<string, string> = new Map(),
): string {
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");

  switch (table) {
    case "destinations":
    case "places":
    case "experiences":
    case "routes":
      return labelOf(row["name_i18n"], text("slug") || row.id);
    case "transport_connections": {
      const from = placeNames.get(text("from_place_id"));
      const to = placeNames.get(text("to_place_id"));
      return [text("operator"), inSentence(text("mode")), from && `from ${from}`, to && `to ${to}`]
        .filter(Boolean)
        .join(" ");
    }
    case "guidance_blocks": {
      const body = labelOf(row["body_i18n"], "");
      const kind = humanLabel(text("guidance_type"));
      return body ? `${kind}: ${truncate(body, 60)}` : kind;
    }
    case "phrases":
      return truncate(text("source_text") || row.id, 60);
    case "advisories":
      return labelOf(row["title_i18n"], "Untitled advisory");
    default:
      return row.id;
  }
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/** Why a scheduled publish did not go out, from the `outcome` the job recorded. */
export function blockedReason(outcome: unknown): string {
  const reason =
    outcome &&
    typeof outcome === "object" &&
    typeof (outcome as { reason?: unknown }).reason === "string"
      ? (outcome as { reason: string }).reason
      : "";

  if (reason.startsWith("Not ready to publish")) {
    return "It no longer passed validation when its time came. Open it to see what is missing.";
  }
  if (reason.startsWith("Separation of duties")) {
    return "The approver who scheduled it had made the last change, so it needs a different approver.";
  }
  if (reason.includes("approver role")) {
    return "The person who scheduled it no longer holds the approver role.";
  }
  return reason || "It could not be published when its time came.";
}
