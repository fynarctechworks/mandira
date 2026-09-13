import type Dexie from "dexie";
import type { EntityTable } from "dexie";

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

/**
 * What a traveler did with no signal, waiting to be sent (TRD §4.7, PRD-OFFL-004).
 *
 * Indexed on `created_at` because the replay order is the whole contract: someone who
 * marked an item done and then answered a Change Card about the rest of their day did
 * those things in that sequence, and replaying them the other way round evaluates the card
 * against a day that had not happened yet.
 */
export type OfflinePendingAction = {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
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
  pending_actions: EntityTable<OfflinePendingAction, "id">;
  meta: EntityTable<OfflineMeta, "key">;
};

/**
 * Bumped whenever a store's SHAPE changes — including when a `v_published_*` view changes
 * what it returns, because that changes what lands in `knowledge_entities`.
 *
 * Version 1 was written fresh against the views as they stand after `0021`, so KNOW-04's
 * deferred bump had nothing to migrate.
 *
 * Version 2 adds `pending_actions` (B-033). Dexie creates a new store on upgrade without
 * touching the existing ones, so a traveler mid-journey keeps their snapshot — which is the
 * point of bumping deliberately rather than renaming the database.
 *
 * Version 3 marks the first time `phrases` is written (PRD-LANG-004): the snapshot now
 * carries the destination's phrase pack, and `v_published_phrases` gained `audio_path`
 * (0035). No store's keys or indexes change, so the upgrade touches nothing already stored.
 * Universal phrases are stored under `destination_id = "*"` (see `phrases-local.ts`).
 */
export const SNAPSHOT_VERSION = 3;

let instance: MandhiraDb | undefined;
let opening: Promise<MandhiraDb> | undefined;

/**
 * The database, created on first use.
 *
 * ASYNC, and Dexie is imported dynamically, for two separate reasons:
 *
 *   1. IndexedDB does not exist on the server, and every page here renders there first.
 *      Constructing at module scope would throw during SSR for anything that merely
 *      imports this file.
 *   2. Dexie is ~50 kB. Statically imported it landed in the first load of the journeys
 *      list, the plan preview and the Live screen — pushing all three past TRD-PERF-001's
 *      180 kB budget for a dependency that is only ever touched after mount, inside an
 *      effect. Measured in B-024, which is what a perf budget is for.
 *
 * The in-flight promise is cached as well as the instance: two callers racing on first
 * mount would otherwise each construct a Dexie over the same database name.
 */
export async function db(): Promise<MandhiraDb> {
  if (instance) return instance;
  if (opening) return opening;

  opening = (async () => {
    const { default: Dexie } = await import("dexie");
    const dexie = new Dexie("mandhira") as MandhiraDb;

    const stores = {
      journeys: "id",
      journey_items: "id, journey_id",
      // Compound primary key, so the same uuid can exist as a place and as an experience
      // without one silently overwriting the other.
      knowledge_entities: "[entity_table+id], journey_id",
      phrases: "id, destination_id",
      prepare_tasks: "id, journey_id",
      meta: "key",
    };

    /*
     * Both versions declared, so a browser holding version 1 upgrades rather than being
     * handed a schema it has never seen. Dexie applies them in order and leaves the
     * existing stores alone — a traveler mid-journey keeps their snapshot.
     */
    dexie.version(1).stores(stores);
    dexie.version(2).stores({ ...stores, pending_actions: "id, created_at" });
    // Same stores: version 3 changes what `phrases` holds, not how it is keyed.
    dexie.version(3).stores({ ...stores, pending_actions: "id, created_at" });

    instance = dexie;
    return dexie;
  })();

  return opening;
}

/** Test seam — `fake-indexeddb` gives each test a fresh backing store. */
export function resetDb(): void {
  instance = undefined;
  opening = undefined;
}

/** Whether this browser can store anything at all (private mode, or an old browser). */
export function offlineAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export const META_LAST_SYNC = "last_sync_at";
export const META_GUEST_DRAFT = "guest_draft";

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const row = await (await db()).meta.get(key);
  return row?.value as T | undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  await (await db()).meta.put({ key, value });
}
