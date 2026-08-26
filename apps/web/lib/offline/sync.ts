import type { KnowledgeBundle } from "@mandhira/journey-engine";

import type { StoredItem, StoredJourney } from "../journeys";
import {
  db,
  META_LAST_SYNC,
  offlineAvailable,
  readMeta,
  writeMeta,
  type OfflineEntity,
} from "./db";
import type { JourneySnapshot } from "./snapshot";

/**
 * Writing and reading the offline snapshot (PRD-OFFL-001/002/003).
 *
 * Every function here fails SOFT. Storage can be unavailable for reasons that have nothing
 * to do with this app — private browsing, a full disk, a browser configured to block site
 * data — and none of them are the traveler's problem to solve while standing at a temple
 * gate. PRD-OFFL-003 is explicit that a sync error dialog must never appear, and the way
 * to honour that is for a failed write to be a no-op rather than an exception someone has
 * to catch.
 *
 * The cost of that is stated plainly: if storage is unavailable, offline does not work.
 * What must not happen is offline not working AND an error interrupting the journey.
 */

export type LocalSnapshot = {
  journey: StoredJourney;
  items: StoredItem[];
  bundle: KnowledgeBundle;
  entities: OfflineEntity[];
  syncedAt: string;
};

/**
 * Fetch a journey's snapshot and store it.
 *
 * Called when a journey is opened or saved (PRD-OFFL-001). Returns what changed, so the
 * caller can show the single reconciliation card PRD-OFFL-003 allows — and nothing else.
 */
export async function syncJourneyOffline(
  journeyId: string,
  locale: string,
): Promise<{ ok: boolean; changed: string[] }> {
  if (!offlineAvailable()) return { ok: false, changed: [] };

  let snapshot: JourneySnapshot;

  try {
    const response = await fetch(
      `/api/journeys/${journeyId}/snapshot?locale=${encodeURIComponent(locale)}`,
      { cache: "no-store" },
    );

    const payload = await response.json();
    if (!payload.ok) return { ok: false, changed: [] };
    snapshot = payload.data as JourneySnapshot;
  } catch {
    // Offline, which is the normal case this whole feature exists for — not an error.
    return { ok: false, changed: [] };
  }

  // What the traveler was looking at before this write, so the card can name what moved.
  const previous = await readSnapshot(journeyId);
  const changed = previous ? knowledgeChanges(previous, snapshot) : [];

  try {
    await writeSnapshot(journeyId, snapshot);
  } catch {
    return { ok: false, changed: [] };
  }

  return { ok: true, changed };
}

async function writeSnapshot(journeyId: string, snapshot: JourneySnapshot): Promise<void> {
  const database = await db();

  await database.transaction(
    "rw",
    [
      database.journeys,
      database.journey_items,
      database.knowledge_entities,
      database.prepare_tasks,
      database.meta,
    ],
    async () => {
      /*
       * Replace rather than merge. A journey whose item was removed online must not keep
       * that item offline — a traveler standing in a queue reading a plan that includes
       * something they deleted is exactly the confusion this is meant to prevent.
       */
      await database.journey_items.where("journey_id").equals(journeyId).delete();
      await database.knowledge_entities.where("journey_id").equals(journeyId).delete();
      await database.prepare_tasks.where("journey_id").equals(journeyId).delete();

      await database.journeys.put({
        id: snapshot.journey.id,
        title: snapshot.journey.title,
        startDate: snapshot.journey.startDate,
        endDate: snapshot.journey.endDate,
        timezone: snapshot.journey.timezone,
        dayStartTime: snapshot.journey.dayStartTime,
        dayEndTime: snapshot.journey.dayEndTime,
        pace: snapshot.journey.pace,
        status: snapshot.journey.status,
        destinationId: snapshot.journey.destinationId,
        syncedAt: snapshot.syncedAt,
      });

      await database.journey_items.bulkPut(
        snapshot.items.map((item) => ({
          id: item.id,
          journey_id: journeyId,
          item: item as unknown as Record<string, unknown>,
        })),
      );

      await database.knowledge_entities.bulkPut(
        snapshot.entities.map((entity) => ({ ...entity, journey_id: journeyId })),
      );

      await database.prepare_tasks.bulkPut(
        snapshot.prepareTasks.map((task) => ({ ...task, journey_id: journeyId })),
      );

      // The engine's input, stored whole and separately from the presentational entities.
      // Keyed under the journey so two journeys in different destinations cannot blend.
      await database.meta.put({ key: bundleKey(journeyId), value: snapshot.bundle });
      await database.meta.put({ key: META_LAST_SYNC, value: snapshot.syncedAt });
    },
  );
}

/** Everything needed to render a journey with no network. */
export async function readSnapshot(journeyId: string): Promise<LocalSnapshot | null> {
  if (!offlineAvailable()) return null;

  try {
    const database = await db();
    const journey = await database.journeys.get(journeyId);
    if (!journey) return null;

    const [items, entities, bundle] = await Promise.all([
      database.journey_items.where("journey_id").equals(journeyId).toArray(),
      database.knowledge_entities.where("journey_id").equals(journeyId).toArray(),
      readMeta<KnowledgeBundle>(bundleKey(journeyId)),
    ]);

    if (!bundle) return null;

    return {
      journey: {
        id: journey.id,
        title: journey.title,
        startDate: journey.startDate,
        endDate: journey.endDate,
        timezone: journey.timezone,
        dayStartTime: journey.dayStartTime,
        dayEndTime: journey.dayEndTime,
        pace: journey.pace as StoredJourney["pace"],
        status: journey.status as StoredJourney["status"],
        destinationId: journey.destinationId,
      },
      items: items.map((row) => row.item as unknown as StoredItem),
      bundle,
      entities,
      syncedAt: journey.syncedAt,
    };
  } catch {
    return null;
  }
}

/** When the stored information is from — what the offline banner should report. */
export async function lastSyncAt(): Promise<string | null> {
  if (!offlineAvailable()) return null;
  try {
    return (await readMeta<string>(META_LAST_SYNC)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Which knowledge changed between the stored snapshot and a fresh one.
 *
 * PRD-OFFL-003: knowledge is SERVER-WINS, and the traveler is told once, in one card,
 * naming what moved. Compared by serialised payload rather than by a timestamp, because a
 * row can be rewritten in Ops without anything a client can see changing — and a card that
 * cries "updated" over an unchanged fact teaches travelers to dismiss the one that matters.
 *
 * Only the things a plan actually depends on are compared. A changed summary paragraph is
 * not worth interrupting someone's morning.
 */
const WATCHED_FIELDS = [
  "opening_schedule",
  "closure_rules_i18n",
  "entry_requirements_i18n",
  "dress_code_i18n",
  "advance_booking_required",
  "advance_booking_how_i18n",
  "duration_likely_minutes",
  "duration_max_minutes",
];

export function knowledgeChanges(previous: LocalSnapshot, next: JourneySnapshot): string[] {
  const before = new Map(previous.entities.map((e) => [`${e.entity_table}:${e.id}`, e.payload]));
  const changed: string[] = [];

  for (const entity of next.entities) {
    const old = before.get(`${entity.entity_table}:${entity.id}`);
    if (!old) continue;

    const differs = WATCHED_FIELDS.some(
      (field) => JSON.stringify(old[field]) !== JSON.stringify(entity.payload[field]),
    );

    if (differs) changed.push(nameOf(entity.payload));
  }

  return [...new Set(changed.filter(Boolean))];
}

function nameOf(payload: Record<string, unknown>): string {
  const names = (payload["name_i18n"] ?? {}) as Record<string, string>;
  return names["en"] ?? "";
}

/** Deletes everything cached for a journey — used when it is removed. */
export async function forgetJourney(journeyId: string): Promise<void> {
  if (!offlineAvailable()) return;

  try {
    const database = await db();
    await database.journeys.delete(journeyId);
    await database.journey_items.where("journey_id").equals(journeyId).delete();
    await database.knowledge_entities.where("journey_id").equals(journeyId).delete();
    await database.prepare_tasks.where("journey_id").equals(journeyId).delete();
    await database.meta.delete(bundleKey(journeyId));
  } catch {
    // Nothing to tell the traveler: a cache that failed to clear is not their problem.
  }
}

export { writeMeta };

function bundleKey(journeyId: string): string {
  return `bundle:${journeyId}`;
}
