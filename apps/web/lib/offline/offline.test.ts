import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, META_LAST_SYNC, readMeta, resetDb, SNAPSHOT_VERSION } from "./db";
import { clearGuestDraft, readGuestDraft, saveGuestDraft } from "./guest-draft";
import { knowledgeChanges, lastSyncAt, readSnapshot, syncJourneyOffline } from "./sync";
import type { JourneySnapshot } from "./snapshot";

/**
 * The offline layer (B-023, PRD-OFFL-001/002/003).
 *
 * Run against a real IndexedDB implementation rather than a mock, because the behaviour
 * worth testing IS the storage layer's — compound keys, transactional replacement, what
 * survives a reopen. A mocked Dexie would assert that the test's own fake works.
 */
const JOURNEY_ID = "11111111-1111-4111-8111-111111111111";

function snapshot(over: Partial<JourneySnapshot> = {}): JourneySnapshot {
  return {
    journey: {
      id: JOURNEY_ID,
      title: "A journey",
      startDate: "2026-10-12",
      endDate: "2026-10-13",
      timezone: "Asia/Kolkata",
      dayStartTime: "06:00",
      dayEndTime: "21:00",
      pace: "balanced",
      status: "draft",
      knowledgeCheckedAt: null,
      destinationId: "d1",
    },
    items: [
      {
        id: "item-1",
        day_index: 0,
        sort_order: 0,
        item_type: "experience",
        tier: "protected",
        experience_id: "e1",
        place_id: "p1",
        planned_start_at: "2026-10-12T00:30:00Z",
        planned_end_at: "2026-10-12T02:00:00Z",
        status: "planned",
        actual_start_at: null,
        actual_end_at: null,
      },
    ] as unknown as JourneySnapshot["items"],
    bundle: {
      places: [],
      experiences: [],
      availability_rules: [],
      routes: [],
      transport_connections: [],
      travel_estimates: [],
      trust: {},
    },
    entities: [
      {
        entity_table: "places",
        id: "p1",
        payload: {
          id: "p1",
          name_i18n: { en: "Hill Temple" },
          entry_requirements_i18n: { en: "Carry photo ID." },
          latitude: 17.386,
          longitude: 78.478,
        },
      },
    ],
    prepareTasks: [{ id: "task-1", payload: { id: "task-1", engine_key: "booking:item-1" } }],
    phrases: [],
    syncedAt: "2026-08-26T10:00:00.000Z",
    ...over,
  };
}

/** A fetch that answers the snapshot route with the given payload. */
function fetchReturning(body: JourneySnapshot) {
  return vi.fn(async () =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, data: body }), { status: 200 })),
  );
}

beforeEach(async () => {
  resetDb();
  await (await db()).delete();
  resetDb();
});

describe("the offline database", () => {
  it("opens at the declared snapshot version", async () => {
    await (await db()).open();
    expect((await db()).verno).toBe(SNAPSHOT_VERSION);
  });

  it("keeps a place and an experience with the same id apart", async () => {
    /*
     * The compound key `[entity_table+id]` earning its place. Ids are uuids and collisions
     * are vanishingly unlikely — but a single-key store would make one SILENT, with a
     * temple's opening hours quietly overwriting a darshan's duration.
     */
    await (
      await db()
    ).knowledge_entities.bulkPut([
      { entity_table: "places", id: "same", journey_id: JOURNEY_ID, payload: { kind: "place" } },
      {
        entity_table: "experiences",
        id: "same",
        journey_id: JOURNEY_ID,
        payload: { kind: "experience" },
      },
    ]);

    expect(await (await db()).knowledge_entities.count()).toBe(2);
  });
});

describe("syncJourneyOffline", () => {
  it("stores the journey, its items, its knowledge and its tasks", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));

    const result = await syncJourneyOffline(JOURNEY_ID, "en");
    expect(result.ok).toBe(true);

    const stored = await readSnapshot(JOURNEY_ID);
    expect(stored?.journey.title).toBe("A journey");
    expect(stored?.items).toHaveLength(1);
    expect(stored?.entities).toHaveLength(1);
    expect(await (await db()).prepare_tasks.count()).toBe(1);
  });

  it("records when the snapshot was written, which is what the banner reports", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    await syncJourneyOffline(JOURNEY_ID, "en");

    // PRD-OFFL-002: the traveler is told how old the DATA is, not when the network last
    // answered. Those are different numbers and only one is their question.
    expect(await lastSyncAt()).toBe("2026-08-26T10:00:00.000Z");
    expect(await readMeta<string>(META_LAST_SYNC)).toBe("2026-08-26T10:00:00.000Z");
  });

  it("replaces rather than merges, so a removed item does not linger", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    await syncJourneyOffline(JOURNEY_ID, "en");

    // The traveler deleted the item online. Reading a plan offline that still contains
    // something they removed is exactly the confusion this feature exists to prevent.
    vi.stubGlobal("fetch", fetchReturning(snapshot({ items: [] })));
    await syncJourneyOffline(JOURNEY_ID, "en");

    expect((await readSnapshot(JOURNEY_ID))?.items).toHaveLength(0);
  });

  it("survives being offline without throwing", async () => {
    // The normal case this whole feature exists for — never an error the traveler sees
    // (PRD-OFFL-003 forbids a sync-error dialog outright).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );

    await expect(syncJourneyOffline(JOURNEY_ID, "en")).resolves.toEqual({
      ok: false,
      changed: [],
    });
  });

  it("leaves a stored snapshot intact when a later sync fails", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    await syncJourneyOffline(JOURNEY_ID, "en");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    await syncJourneyOffline(JOURNEY_ID, "en");

    // Losing the cache because the network went away would defeat the entire point.
    expect((await readSnapshot(JOURNEY_ID))?.items).toHaveLength(1);
  });

  it("returns nothing for a journey never stored", async () => {
    expect(await readSnapshot("nope")).toBeNull();
  });
});

describe("reconciliation (PRD-OFFL-003)", () => {
  it("names what changed when knowledge a plan depends on moved", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    await syncJourneyOffline(JOURNEY_ID, "en");

    const updated = snapshot();
    updated.entities[0]!.payload["entry_requirements_i18n"] = { en: "Photo ID and a ticket." };
    vi.stubGlobal("fetch", fetchReturning(updated));

    const result = await syncJourneyOffline(JOURNEY_ID, "en");
    expect(result.changed).toEqual(["Hill Temple"]);
  });

  it("says nothing when nothing a plan depends on moved", async () => {
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    await syncJourneyOffline(JOURNEY_ID, "en");

    /*
     * An edited summary paragraph is not worth interrupting someone's morning. A card that
     * cries "updated" over prose teaches travelers to dismiss the one that matters — which
     * will be a closure or a dress code.
     */
    const updated = snapshot();
    updated.entities[0]!.payload["summary_i18n"] = { en: "Rewritten by an editor." };
    vi.stubGlobal("fetch", fetchReturning(updated));

    expect((await syncJourneyOffline(JOURNEY_ID, "en")).changed).toEqual([]);
  });

  it("says nothing on the very first sync", async () => {
    // There is no "while you were offline" before there was an offline copy.
    vi.stubGlobal("fetch", fetchReturning(snapshot()));
    expect((await syncJourneyOffline(JOURNEY_ID, "en")).changed).toEqual([]);
  });

  it("reports each changed entity once, however many fields moved", () => {
    const previous = {
      journey: snapshot().journey,
      items: [],
      bundle: snapshot().bundle,
      entities: [
        {
          entity_table: "places",
          id: "p1",
          journey_id: JOURNEY_ID,
          payload: {
            name_i18n: { en: "Hill Temple" },
            opening_schedule: { weekly: {} },
            dress_code_i18n: { en: "Traditional." },
          },
        },
      ],
      syncedAt: "2026-08-26T10:00:00.000Z",
    };

    const next = snapshot({
      entities: [
        {
          entity_table: "places",
          id: "p1",
          payload: {
            name_i18n: { en: "Hill Temple" },
            opening_schedule: { weekly: { mon: [] } },
            dress_code_i18n: { en: "Traditional dress; no footwear." },
          },
        },
      ],
    });

    expect(knowledgeChanges(previous, next)).toEqual(["Hill Temple"]);
  });
});

describe("a guest's draft", () => {
  it("survives being stored and read back", async () => {
    await saveGuestDraft({ destinationId: "d1", startDate: "2026-10-12" });

    const draft = await readGuestDraft();
    expect(draft?.brief["destinationId"]).toBe("d1");
  });

  it("is forgotten on request, so a shared phone does not keep it", async () => {
    // The reason this is a feature rather than tidying up: the next person to open the app
    // on a shared phone must not be reading someone else's pilgrimage.
    await saveGuestDraft({ destinationId: "d1" });
    await clearGuestDraft();

    expect(await readGuestDraft()).toBeNull();
  });

  it("expires after a month rather than lingering", async () => {
    await (
      await db()
    ).meta.put({
      key: "guest_draft",
      value: {
        brief: { destinationId: "d1" },
        savedAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      },
    });

    // A half-finished thought from six weeks ago is more likely to confuse than help —
    // its dates have usually passed.
    expect(await readGuestDraft()).toBeNull();
    expect(await (await db()).meta.get("guest_draft")).toBeUndefined();
  });

  it("returns nothing when none was ever saved", async () => {
    expect(await readGuestDraft()).toBeNull();
  });
});
