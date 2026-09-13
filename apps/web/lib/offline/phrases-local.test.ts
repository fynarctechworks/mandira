import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PhraseRow } from "../phrases";
import { db, resetDb } from "./db";
import { readPhrasesOffline, savePhrasesOffline, UNIVERSAL_PHRASES } from "./phrases-local";
import type { JourneySnapshot } from "./snapshot";
import { syncJourneyOffline } from "./sync";

/**
 * Phrase packs on the device (PRD-OFFL-001, PRD-LANG-004).
 *
 * Against a real IndexedDB implementation, like `offline.test.ts`: what is worth testing is
 * the store's behaviour — the null-key workaround for universal phrases, replacement, and
 * what survives a snapshot that could not read the pack.
 */
const JOURNEY_ID = "22222222-2222-4222-8222-222222222222";

function phrase(over: Partial<PhraseRow> = {}): PhraseRow {
  return {
    id: "ph-1",
    destination_id: "d1",
    context_tag: "directions",
    source_locale: "en",
    source_text: "Where is the east gate?",
    translations: { te: { text: "తూర్పు ద్వారం ఎక్కడ ఉంది?" } },
    sort_order: 0,
    audio_url: null,
    ...over,
  };
}

function snapshot(phrases: PhraseRow[] | null): JourneySnapshot {
  return {
    journey: {
      id: JOURNEY_ID,
      title: "A journey",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      timezone: "Asia/Kolkata",
      dayStartTime: "06:00",
      dayEndTime: "21:00",
      pace: "balanced",
      status: "draft",
      knowledgeCheckedAt: null,
      destinationId: "d1",
    },
    items: [],
    bundle: {
      places: [],
      experiences: [],
      availability_rules: [],
      routes: [],
      transport_connections: [],
      travel_estimates: [],
      trust: {},
    },
    entities: [],
    prepareTasks: [],
    phrases,
    syncedAt: "2026-09-13T10:00:00.000Z",
  };
}

function fetchReturning(body: JourneySnapshot) {
  return vi.fn(async () =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, data: body }), { status: 200 })),
  );
}

const ids = (rows: PhraseRow[] | null) => (rows ?? []).map((row) => row.id).sort();

beforeEach(async () => {
  resetDb();
  await (await db()).delete();
  resetDb();
});

describe("phrase packs on the device", () => {
  it("reads a destination's own phrases beside the universal ones", async () => {
    const universal = phrase({ id: "ph-u", destination_id: null, context_tag: "help" });
    await savePhrasesOffline("d1", [phrase(), universal]);
    await savePhrasesOffline("d2", [phrase({ id: "ph-2", destination_id: "d2" }), universal]);

    expect(ids(await readPhrasesOffline("d1"))).toEqual(["ph-1", "ph-u"]);
    expect(ids(await readPhrasesOffline("d2"))).toEqual(["ph-2", "ph-u"]);

    // Stored under the sentinel, because IndexedDB does not index a null key; the payload
    // still says what the row really is.
    const stored = await (await db()).phrases.get("ph-u");
    expect(stored?.destination_id).toBe(UNIVERSAL_PHRASES);
    expect((stored?.payload as PhraseRow).destination_id).toBeNull();
  });

  it("replaces a pack rather than merging it, so an unpublished phrase does not linger", async () => {
    await savePhrasesOffline("d1", [phrase(), phrase({ id: "ph-2" })]);
    await savePhrasesOffline("d1", [phrase({ id: "ph-2" })]);

    expect(ids(await readPhrasesOffline("d1"))).toEqual(["ph-2"]);
  });

  it("is empty for a destination nothing was saved for", async () => {
    expect(await readPhrasesOffline("never-seen")).toEqual([]);
  });
});

describe("the journey snapshot carries the pack", () => {
  it("stores the destination's phrases when a journey syncs", async () => {
    vi.stubGlobal(
      "fetch",
      fetchReturning(snapshot([phrase(), phrase({ id: "ph-u", destination_id: null })])),
    );

    expect((await syncJourneyOffline(JOURNEY_ID, "en")).ok).toBe(true);
    expect(ids(await readPhrasesOffline("d1"))).toEqual(["ph-1", "ph-u"]);
  });

  it("keeps what the device holds when the snapshot could not read the pack", async () => {
    await savePhrasesOffline("d1", [phrase()]);
    vi.stubGlobal("fetch", fetchReturning(snapshot(null)));

    expect((await syncJourneyOffline(JOURNEY_ID, "en")).ok).toBe(true);
    expect(ids(await readPhrasesOffline("d1"))).toEqual(["ph-1"]);
  });
});
