"use client";

import { useEffect, useState } from "react";

/**
 * Read-through cache: revalidate when there is a network, always answer from the store
 * (FRONTEND_ARCHITECTURE §11.2, TRD-ARCH-005).
 *
 * The order is the whole point, and it is the opposite of the obvious one. This does not
 * "try the network, fall back to the cache" — it refreshes the cache when it can, then
 * reads the cache either way, so the same code path serves a traveler with five bars and
 * one on a hillside with none. A fallback path only exercised offline is a path that is
 * broken offline.
 *
 * `revalidate` must fail SOFT: offline is the normal case this exists for, not an error
 * (PRD-OFFL-003 forbids showing one at all).
 */
export function useOfflineFirst<T>(input: {
  /** Re-runs when this changes; also what identifies the subscription. */
  key: string;
  /** Refresh the local store from the network. Never throws. */
  revalidate: () => Promise<{ changed: string[] }>;
  /** Read whatever is stored locally, fresh or not. */
  read: () => Promise<T | null>;
  /** How often to try again, in ms. */
  intervalMs?: number;
}): { data: T | null; changed: string[]; dismissChanged: () => void } {
  const { key, revalidate, read, intervalMs = 60_000 } = input;

  const [data, setData] = useState<T | null>(null);
  const [changed, setChanged] = useState<string[]>([]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    async function run() {
      const result = await revalidate();
      if (cancelled) return;

      // PRD-OFFL-003: one card, naming what moved, and only when something did.
      if (result.changed.length > 0) setChanged(result.changed);

      const local = await read();
      if (!cancelled && local) setData(local);
    }

    void run();

    const timer = setInterval(() => void run(), intervalMs);
    // Coming back from a tunnel is the moment this matters most.
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
    /*
     * Keyed on `key` alone, deliberately.
     *
     * `revalidate` and `read` are closures rebuilt on every render. Including them would
     * tear down and restart the interval on each one — and this component re-renders every
     * second to keep its countdown honest, so that would mean re-syncing once a second.
     * The closures only ever read `key`-derived state, so pinning to `key` is correct as
     * well as necessary.
     */
  }, [key, intervalMs]);

  return { data, changed, dismissChanged: () => setChanged([]) };
}
