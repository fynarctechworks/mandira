import { describe, expect, it, vi } from "vitest";

import { clearDeviceData, holdsTravelerData } from "./device-data";

function cacheStore(names: string[]) {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      keys: vi.fn(async () => names),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    },
  };
}

describe("clearDeviceData", () => {
  it("deletes the offline database and every cache holding a traveler's data", async () => {
    const { store, deleted } = cacheStore([
      "mandhira-phrase-audio",
      "pages",
      "pages-rsc",
      "apis",
      "serwist-precache-v2",
      "next-static-js-assets",
    ]);
    const deleteDatabase = vi.fn(async () => undefined);

    await clearDeviceData({ caches: store, deleteDatabase });

    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(deleted.sort()).toEqual(["apis", "mandhira-phrase-audio", "pages", "pages-rsc"]);
  });

  it("keeps the app itself: the precache and static assets are nobody's data", () => {
    expect(holdsTravelerData("serwist-precache-v2")).toBe(false);
    expect(holdsTravelerData("static-font-assets")).toBe(false);
    expect(holdsTravelerData("mandhira-journey")).toBe(true);
  });

  it("still lets sign-out finish when storage refuses", async () => {
    const store = {
      keys: vi.fn(async () => {
        throw new Error("blocked");
      }),
      delete: vi.fn(),
    };

    await expect(
      clearDeviceData({
        caches: store,
        deleteDatabase: async () => {
          throw new Error("blocked");
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("never hangs sign-out on a database another tab holds open", async () => {
    vi.useFakeTimers();
    try {
      const pending = clearDeviceData({
        caches: undefined,
        deleteDatabase: () => new Promise(() => undefined),
        timeoutMs: 3000,
      });
      await vi.advanceTimersByTimeAsync(3000);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
