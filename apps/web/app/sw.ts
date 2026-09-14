import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  RangeRequestsPlugin,
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
        url.pathname.startsWith("/api/heartbeat") ||
        // An Ops preview shows unpublished content, which must never be stored (OPS-PREVIEW-01).
        /^\/[a-z]{2}\/preview\//.test(url.pathname),
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
      /*
       * Phrase recordings (A17, D-175). The offline sync downloads each whole file into this
       * cache (`lib/offline/phrase-audio.ts`); playback asks for byte ranges, which the range
       * plugin answers from that stored file, so a phrase plays at a temple gate with no signal.
       * A partial 206 fetched on first play is never stored, only a whole 200.
       */
      matcher: ({ request, url }) =>
        request.destination === "audio" &&
        url.pathname.includes("/storage/v1/object/public/media/"),
      handler: new CacheFirst({
        cacheName: "mandhira-audio",
        plugins: [
          // Only a whole file is stored; a 206 fetched on first play is served but never kept.
          { cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null) },
          /*
           * The class declares its optional hooks in a way `exactOptionalPropertyTypes` rejects,
           * though at runtime it is exactly a Serwist plugin; the adapter says so once, here.
           */
          new RangeRequestsPlugin() as unknown as SerwistPlugin,
          new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 60 }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "image",
      handler: new CacheFirst({
        cacheName: "mandhira-images",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 })],
      }),
    },
    {
      /*
       * Our own API, never from cache.
       *
       * `defaultCache` below caches same-origin GET `/api/*` network-first with a ten-second
       * timeout. On a weak link that hands `syncJourneyOffline` a snapshot cached a day ago,
       * which it then writes over newer data on the device — the offline copy moving
       * BACKWARDS. The app already keeps its own offline copy in IndexedDB, deliberately, so
       * an API answer is either live or not at all, and "not at all" falls through to that
       * copy.
       */
      matcher: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
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

// ── Push (PRD F15) ──────────────────────────────────────────────────────────────────────
/*
 * Without these two listeners a push reached the device and was never shown: the cron sent
 * it, the push service delivered it, and the traveler saw nothing.
 */
type PushPayload = { title?: unknown; body?: unknown; url?: unknown; tag?: unknown };

/** Only a path on this origin may be opened from a notification, never another site. */
function safePath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    // A payload that is not JSON still deserves a notification rather than silence.
    payload = { body: event.data?.text() ?? "" };
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "Mandhira";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: safePath(payload.url) },
      // The same tag replaces an older reminder for the same journey instead of stacking.
      ...(typeof payload.tag === "string" ? { tag: payload.tag } : {}),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePath((event.notification.data as { url?: unknown } | null)?.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);

      if (open) {
        /*
         * A tap is the traveler asking to go there, so moving an open window is not the
         * unprompted reload TRD-DEPL-002 forbids.
         *
         * `navigate()` rejects for a window this worker does not control — one opened before
         * it activated, which `includeUncontrolled` deliberately finds. That window is still
         * focused when it is already on the right page; otherwise a new one is opened on
         * the same same-origin path rather than the tap doing nothing.
         */
        const here = new URL(open.url);
        try {
          if (here.pathname + here.search !== url) await open.navigate(url);
          await open.focus();
          return;
        } catch {
          // Fall through to opening a window.
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});

serwist.addEventListeners();
