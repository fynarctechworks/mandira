/**
 * Phrase recordings kept on the device (D-175, PRD-OFFL-001).
 *
 * A phrase is most needed where the signal is worst — at a temple gate, in a queue. The text
 * is already in IndexedDB; this puts each recording in the Cache Storage bucket the service
 * worker serves audio from (`sw.ts`), so playback works offline too.
 *
 * Why a full download here rather than letting the service worker cache on first play:
 * browsers fetch audio with Range requests, which answer 206 with part of the file, and a
 * partial response is not something a cache can serve back. A plain GET stores the whole file;
 * the worker then answers each range from it.
 */

/** Must match the cache name in `app/sw.ts`. */
export const PHRASE_AUDIO_CACHE = "mandhira-audio";

/** A pack is small; a runaway list is not, and this runs on a phone's data plan. */
const MAX_RECORDINGS = 150;

export async function warmPhraseAudio(
  urls: readonly (string | null | undefined)[],
  cacheStorage: CacheStorage | undefined = globalThis.caches,
): Promise<{ stored: number; alreadyHeld: number; failed: number }> {
  const result = { stored: 0, alreadyHeld: 0, failed: 0 };
  if (!cacheStorage) return result;

  const wanted = [...new Set(urls.filter((url): url is string => !!url))].slice(0, MAX_RECORDINGS);
  if (wanted.length === 0) return result;

  const cache = await cacheStorage.open(PHRASE_AUDIO_CACHE);

  for (const url of wanted) {
    if (await cache.match(url)) {
      result.alreadyHeld += 1;
      continue;
    }
    try {
      // `add` fetches without a Range header and stores only a successful response.
      await cache.add(url);
      result.stored += 1;
    } catch {
      // Offline, or the recording was unpublished. The text still works; the next sync retries.
      result.failed += 1;
    }
  }

  return result;
}
