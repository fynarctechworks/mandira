"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser believes it has a network, for controls that need one to work.
 *
 * Deliberately the cheap signal. `navigator.onLine === false` is conclusive — there is no
 * network — while `true` only means "worth trying", which is exactly what a button needs to
 * know to decide whether to be enabled. The connection banner does the more careful thing
 * (a heartbeat, because a captive portal also reports "online"), and a control that tries
 * and fails honestly is the right place for the rest of that judgement.
 *
 * `useSyncExternalStore` so a server render and the first client render agree: the server
 * has no `navigator`, and assuming "online" there matches what nearly every first paint is.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
