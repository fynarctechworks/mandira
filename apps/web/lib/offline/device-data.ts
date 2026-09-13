import { deleteDb, offlineAvailable } from "./db";

/**
 * Forgetting this device's copy of a traveler (PRD-PRIV, PRD-OFFL-001).
 *
 * The offline snapshot is the traveler's own journey — where they are going, when, with
 * whom, what they queued with no signal — and a pilgrimage phone is very often a shared
 * family phone. Signing out used to end the session and leave all of it in IndexedDB and
 * Cache Storage for whoever signed in next. This removes it, before the redirect.
 *
 * What goes:
 *   - the `mandhira` IndexedDB database: journeys, items, the knowledge snapshot, prepare
 *     tasks, phrases, the outbox and the guest draft;
 *   - every cache the service worker fills with pages or API answers (`sw.ts`): the
 *     `mandhira-*` caches and Serwist's `defaultCache` runtime caches that hold documents,
 *     RSC payloads, JSON or images (`pages`, `pages-rsc`, `apis`, `next-data`, …).
 *
 * What stays: the precache and the static build assets (JS, CSS, fonts). They are the app,
 * not anybody's data, and deleting them would only make the next start slower.
 *
 * Fails soft and never hangs: sign-out must complete even when storage is blocked or a
 * second tab is holding the database open.
 */
export const JOURNEY_CACHES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "apis",
  "next-data",
  "next-image",
  "others",
  "cross-origin",
] as const;

/** A cache holds a traveler's data when it is one of ours or one of the runtime caches above. */
export function holdsTravelerData(name: string): boolean {
  return name.startsWith("mandhira-") || (JOURNEY_CACHES as readonly string[]).includes(name);
}

type CacheStore = Pick<CacheStorage, "keys" | "delete">;

export type DeviceDataDeps = {
  caches?: CacheStore | undefined;
  deleteDatabase?: () => Promise<void>;
  /** How long to wait for storage before giving up and letting sign-out continue. */
  timeoutMs?: number;
};

/** Removes this device's offline copy of the signed-in traveler. Always resolves. */
export async function clearDeviceData(deps: DeviceDataDeps = {}): Promise<void> {
  const cacheStore = "caches" in deps ? deps.caches : globalThis.caches;
  const deleteDatabase =
    deps.deleteDatabase ?? (offlineAvailable() ? deleteDb : async () => undefined);
  const timeoutMs = deps.timeoutMs ?? 3000;

  const work = Promise.allSettled([
    deleteDatabase(),
    (async () => {
      if (!cacheStore) return;
      const names = await cacheStore.keys();
      await Promise.allSettled(
        names.filter(holdsTravelerData).map((name) => cacheStore.delete(name)),
      );
    })(),
  ]);

  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
