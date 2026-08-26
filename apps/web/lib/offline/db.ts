import Dexie, { type EntityTable } from "dexie";

/**
 * The offline database (TRD §4.8, PRD F11).
 *
 * The stores and their keys are the TRD's, verbatim, because TRD-ARCH-002 makes this
 * snapshot and the engine's `KnowledgeBundle` the same bytes: the engine must behave
 * identically whether it is fed from Postgres or from here. A store shaped "close enough"
 * would produce a plan that is subtly different in airplane mode, which is the one place
 * nobody can check it against anything.
 *
 * Everything here is per-device and per-browser. It is a cache of the traveler's own data,
 * never a second source of truth — the server is authoritative for knowledge, and for the
 * journey once there is an account.
 */

/** A journey as the snapshot holds it: the row, flattened, plus its own freshness. */
export type OfflineJourney = {
  id: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  dayStartTime: string;
  dayEndTime: string;
  pace: string;
  status: string;
  destinationId: string | null;
  /** When this journey's snapshot was last written, for the "as of" the banner shows. */
  syncedAt: string;
};

export type OfflineItem = {
  id: string;
  journey_id: string;
  /** The whole item, exactly as the engine's `JourneyItem` expects it. */
  item: Record<string, unknown>;
};

/**
 * One row per knowledge entity, keyed `[entity_table+id]` per the TRD.
 *
 * A single generic store rather than one per entity type, so adding a knowledge kind later
 * is data rather than a schema version. `journey_id` is indexed because eviction is
 * per-journey: when a journey goes, what was cached only for it goes with it.
 */
export type OfflineEntity = {
  entity_table: string;
  id: string;
  journey_id: string;
  payload: Record<string, unknown>;
};

export type OfflinePhrase = {
  id: string;
  destination_id: string;
  payload: Record<string, unknown>;
};

export type OfflinePrepareTask = {
  id: string;
  journey_id: string;
  payload: Record<string, unknown>;
};

/** `last_sync_at`, `snapshot_version`, and the guest draft. */
export type OfflineMeta = {
  key: string;
  value: unknown;
};

export type MandhiraDb = Dexie & {
  journeys: EntityTable<OfflineJourney, "id">;
  journey_items: EntityTable<OfflineItem, "id">;
  knowledge_entities: EntityTable<OfflineEntity, "id">;
  phrases: EntityTable<OfflinePhrase, "id">;
  prepare_tasks: EntityTable<OfflinePrepareTask, "id">;
  meta: EntityTable<OfflineMeta, "key">;
};

/**
 * Bumped whenever a store's SHAPE changes — including when a `v_published_*` view changes
 * what it returns, because that changes what lands in `knowledge_entities`.
 *
 * Version 1 is written fresh against the views as they stand after `0021`, so KNOW-04's
 * deferred bump has nothing to migrate: there is no version 0 in the wild. The next shape
 * change is the one that has to do this deliberately (CLAUDE.md §4).
 */
export const SNAPSHOT_VERSION = 1;

let instance: MandhiraDb | undefined;

/**
 * The database, created on first use.
 *
 * Lazy because IndexedDB does not exist on the server, and every page in this app renders
 * there first. Constructing at module scope would throw during SSR for any module that
 * merely imports this one.
 */
export function db(): MandhiraDb {
  if (instance) return instance;

  const dexie = new Dexie("mandhira") as MandhiraDb;

  dexie.version(SNAPSHOT_VERSION).stores({
    journeys: "id",
    journey_items: "id, journey_id",
    // Compound primary key, so the same uuid can exist as a place and as an experience
    // without one silently overwriting the other.
    knowledge_entities: "[entity_table+id], journey_id",
    phrases: "id, destination_id",
    prepare_tasks: "id, journey_id",
    meta: "key",
  });

  instance = dexie;
  return dexie;
}

/** Test seam — `fake-indexeddb` gives each test a fresh backing store. */
export function resetDb(): void {
  instance = undefined;
}

/** Whether this browser can store anything at all (private mode, or an old browser). */
export function offlineAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export const META_LAST_SYNC = "last_sync_at";
export const META_GUEST_DRAFT = "guest_draft";

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const row = await db().meta.get(key);
  return row?.value as T | undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}
