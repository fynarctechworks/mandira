import { describe, expect, it, vi } from "vitest";

import { PHRASE_AUDIO_CACHE, warmPhraseAudio } from "./phrase-audio";

function fakeCaches(held: string[] = [], failing: string[] = []) {
  const store = new Set(held);
  const cache = {
    match: vi.fn(async (url: string) => (store.has(url) ? new Response("audio") : undefined)),
    add: vi.fn(async (url: string) => {
      if (failing.includes(url)) throw new TypeError("network");
      store.add(url);
    }),
  };
  const open = vi.fn(async () => cache);
  return { caches: { open } as unknown as CacheStorage, cache, open, store };
}

const A = "https://x.supabase.co/storage/v1/object/public/media/a.mp3";
const B = "https://x.supabase.co/storage/v1/object/public/media/b.mp3";

describe("warmPhraseAudio", () => {
  it("downloads each recording once into the cache the service worker serves from", async () => {
    const fake = fakeCaches([A]);

    const result = await warmPhraseAudio([A, B, B, null, undefined], fake.caches);

    expect(fake.open).toHaveBeenCalledWith(PHRASE_AUDIO_CACHE);
    expect(fake.cache.add).toHaveBeenCalledTimes(1);
    expect(fake.cache.add).toHaveBeenCalledWith(B);
    expect(result).toEqual({ stored: 1, alreadyHeld: 1, failed: 0 });
  });

  it("carries on past a recording it cannot fetch", async () => {
    const fake = fakeCaches([], [A]);

    expect(await warmPhraseAudio([A, B], fake.caches)).toEqual({
      stored: 1,
      alreadyHeld: 0,
      failed: 1,
    });
    expect(fake.store.has(B)).toBe(true);
  });

  it("does nothing without Cache Storage, or without recordings", async () => {
    expect(await warmPhraseAudio([A], undefined)).toEqual({ stored: 0, alreadyHeld: 0, failed: 0 });

    const fake = fakeCaches();
    await warmPhraseAudio([null], fake.caches);
    expect(fake.open).not.toHaveBeenCalled();
  });
});
