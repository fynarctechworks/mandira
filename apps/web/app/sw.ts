import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker (TRD §11.2 Day 9, PRD-OFFL-002).
 *
 * Caching strategy follows FRONTEND_ARCHITECTURE:
 *   - published knowledge → stale-while-revalidate, so a page opens instantly from cache
 *     and refreshes behind the traveler
 *   - images → cache-first, since they are immutable once uploaded
 *   - auth and journey writes → network-only, because a stale answer to "did my change
 *     save?" is worse than no answer
 *
 * `skipWaiting` is NOT automatic. TRD-DEPL-002 forbids reloading during Live mode, so a
 * new worker waits until the traveler taps the update toast.
 */
/*
 * Read once into a local. Serwist injects the precache list by finding exactly one textual
 * `self.__SW_MANIFEST` in this file and replacing it — referencing it twice (as a
 * conditional spread naturally does) fails the build with "Multiple instances found".
 */
const precacheEntries = self.__SW_MANIFEST;

const serwist = new Serwist({
  // Spread rather than assigned: the manifest is genuinely absent in dev, and under
  // `exactOptionalPropertyTypes` an explicit `undefined` is not a valid option value.
  ...(precacheEntries ? { precacheEntries } : {}),
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Never serve a cached answer for anything that changes state or identity.
      matcher: ({ url, request }) =>
        request.method !== "GET" ||
        url.pathname.startsWith("/auth/") ||
        url.pathname.startsWith("/api/heartbeat"),
      handler: new NetworkOnly(),
    },
    {
      // Published knowledge: instant from cache, refreshed in the background.
      matcher: ({ url }) => url.pathname.includes("/rest/v1/v_published_"),
      handler: new StaleWhileRevalidate({
        cacheName: "mandhira-knowledge",
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      /*
       * The pages themselves (PRD-OFFL-002/007).
       *
       * Without this, reloading offline fails at the DOCUMENT — IndexedDB holds the whole
       * journey and the browser never gets far enough to read it. Everything downstream of
       * that is irrelevant: the traveler sees the browser's own error page.
       *
       * NetworkFirst, not CacheFirst: online, a traveler must get the current plan, and a
       * cached shell served in preference to a live one is how someone ends up acting on
       * yesterday's journey. Offline it falls through to the cached copy, and the Live
       * screen then recomputes from IndexedDB against the real clock — so a stale DOCUMENT
       * never means a stale ANSWER.
       *
       * Declared explicitly rather than left to `defaultCache` so the intent, and the
       * three-second patience, are visible where someone will look for them.
       */
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "mandhira-pages",
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "mandhira-images",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 })],
      }),
    },
    ...defaultCache,
  ],
});

// The update toast asks for the handover; the worker never takes it unprompted.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
