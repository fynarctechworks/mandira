import type { PhraseRow } from "../phrases";
import { db, offlineAvailable, type MandhiraDb } from "./db";

/**
 * Phrase packs on the device (PRD-OFFL-001: "phrase packs for the destination").
 *
 * The `phrases` store is TRD §4.8's, keyed `id` and indexed on `destination_id`. A universal
 * phrase has no destination, and IndexedDB does not index a null key — so it is stored under
 * a sentinel instead and read back beside the destination's own. The stored payload keeps the
 * real `destination_id`.
 *
 * Fails soft throughout, like the rest of this folder: storage that is unavailable is not the
 * traveler's problem, and PRD-OFFL-003 forbids telling them about it.
 */
export const UNIVERSAL_PHRASES = "*";

/**
 * Replaces one destination's pack. Runs inside whatever transaction the caller opened, so
 * the journey snapshot can write phrases atomically with everything else.
 */
export async function replacePhrases(
  database: MandhiraDb,
  destinationId: string,
  rows: PhraseRow[],
): Promise<void> {
  await database.phrases.where("destination_id").anyOf([destinationId, UNIVERSAL_PHRASES]).delete();
  await database.phrases.bulkPut(
    rows.map((row) => ({
      id: row.id,
      destination_id: row.destination_id ?? UNIVERSAL_PHRASES,
      payload: row as unknown as Record<string, unknown>,
    })),
  );
}

/** Keeps a pack a traveler has opened online, so it is there the next time they have none. */
export async function savePhrasesOffline(destinationId: string, rows: PhraseRow[]): Promise<void> {
  if (!offlineAvailable()) return;
  try {
    const database = await db();
    await database.transaction("rw", database.phrases, () =>
      replacePhrases(database, destinationId, rows),
    );
  } catch {
    // Nothing to tell the traveler: the page they are reading is unaffected.
  }
}

/** The stored pack, or null when this device cannot store anything. */
export async function readPhrasesOffline(destinationId: string): Promise<PhraseRow[] | null> {
  if (!offlineAvailable()) return null;
  try {
    const database = await db();
    const stored = await database.phrases
      .where("destination_id")
      .anyOf([destinationId, UNIVERSAL_PHRASES])
      .toArray();
    return stored.map((entry) => entry.payload as unknown as PhraseRow);
  } catch {
    return null;
  }
}
