/// <reference lib="webworker" />
// The service worker runs in a worker scope, not the DOM. Next's app tsconfig targets the
// DOM, so this reference brings in ServiceWorkerGlobalScope for `app/sw.ts` only.
export {};
