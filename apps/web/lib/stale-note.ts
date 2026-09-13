import { criticalFieldsFor } from "@mandhira/db";

import type { TrustMap } from "./trust";

/**
 * The one-time note on a journey item whose critical information has gone stale
 * (PRD-TRST-004, PRD F9: "This timing was last confirmed [N] months ago").
 *
 * Critical fields only — the ones a plan depends on (opening hours, closures, requirements) —
 * because a stale description is not a reason to interrupt anyone. The oldest stale
 * confirmation across the item's experience and place is the one worth saying.
 */
export type StaleNote = { entityId: string; field: string; verifiedAt: string; months: number };

const MONTH_MS = 30.44 * 86_400_000;

export function staleNoteFor(
  item: { experience_id?: string | null; place_id?: string | null },
  trustByEntity: Record<string, TrustMap | undefined>,
  now: Date = new Date(),
): StaleNote | null {
  const stale: Omit<StaleNote, "months">[] = [];

  const collect = (entityId: string | null | undefined, table: "experiences" | "places") => {
    if (!entityId) return;
    const trust = trustByEntity[entityId];
    if (!trust) return;
    for (const { field } of criticalFieldsFor(table)) {
      // A null field is whole-entity trust, which no single timing stands for.
      if (!field) continue;
      const entry = trust[field];
      if (entry?.freshness === "stale" && entry.verified_at) {
        stale.push({ entityId, field, verifiedAt: entry.verified_at });
      }
    }
  };

  collect(item.experience_id, "experiences");
  collect(item.place_id, "places");
  if (stale.length === 0) return null;

  const oldest = stale.sort((a, b) => Date.parse(a.verifiedAt) - Date.parse(b.verifiedAt))[0]!;
  const months = Math.max(
    1,
    Math.floor((now.getTime() - Date.parse(oldest.verifiedAt)) / MONTH_MS),
  );

  return { ...oldest, months };
}

/** Remembered per confirmation, so a field re-verified and gone stale again is said again. */
export function staleNoteKey(itemId: string, note: StaleNote): string {
  return `mandhira:stale-note:${itemId}:${note.entityId}:${note.field}:${note.verifiedAt}`;
}
