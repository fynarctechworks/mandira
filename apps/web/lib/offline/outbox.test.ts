import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, resetDb, SNAPSHOT_VERSION } from "./db";
import { clearOutbox, enqueue, flushOutbox, pendingCount } from "./outbox";

/**
 * The offline outbox (B-033, PRD-OFFL-004).
 *
 * Against a real IndexedDB, because the behaviour worth testing IS the storage layer's —
 * ordering across a reopen, and what survives a partial flush.
 */
beforeEach(async () => {
  resetDb();
  await (await db()).delete();
  resetDb();
});

/** A fetch that succeeds, recording what it was called with. */
function succeeding() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });
}

describe("the schema version", () => {
  it("is 3, and still carries the pending_actions queue version 2 added", async () => {
    // A browser holding an older version must UPGRADE rather than meet a schema it has never
    // seen — which is why every version is declared and the database is not renamed. Version
    // 3 added the phrase pack (D-175); an upgrade must never drop the outbox.
    expect(SNAPSHOT_VERSION).toBe(3);
    const database = await db();
    expect(database.verno).toBe(3);
    expect(database.tables.map((table) => table.name)).toContain("pending_actions");
  });
});

describe("queueing", () => {
  it("keeps what was done with no signal", async () => {
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i1", action: "done" });
    expect(await pendingCount()).toBe(1);
  });

  it("survives the database being reopened", async () => {
    await enqueue("report_create", { entityId: "p1" });
    resetDb();

    // The whole point: a traveler closes the app on a train and the report is still there.
    expect(await pendingCount()).toBe(1);
  });
});

describe("flushing", () => {
  it("sends in the order things were done", async () => {
    /*
     * The ordering rule. Someone who marked an item done and THEN answered a Change Card
     * about the rest of their day did those in that sequence — replaying the other way
     * round evaluates the card against a day that has not happened yet.
     */
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i1", action: "done" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await enqueue("change_decision", { journeyId: "j1", eventId: "e1", optionId: "o1" });

    const fetchImpl = succeeding();
    vi.stubGlobal("fetch", fetchImpl);

    const result = await flushOutbox();

    expect(result.sent).toBe(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/items/i1/status");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/changes/e1");
  });

  it("empties the queue on success", async () => {
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i1", action: "done" });
    vi.stubGlobal("fetch", succeeding());

    await flushOutbox();
    expect(await pendingCount()).toBe(0);
  });

  it("strips the routing fields out of the body", async () => {
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i1", action: "done" });

    const fetchImpl = succeeding();
    vi.stubGlobal("fetch", fetchImpl);
    await flushOutbox();

    // `journeyId` and `itemId` are in the URL; sending them again would be rejected by the
    // route's schema, which is strict about what it accepts.
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ action: "done" });
  });

  it("STOPS at the first network failure rather than burning the rest", async () => {
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i1", action: "done" });
    await enqueue("item_status_update", { journeyId: "j1", itemId: "i2", action: "done" });

    const fetchImpl = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchImpl);

    const result = await flushOutbox();

    /*
     * If one request could not reach the server the next will not either. Working through
     * the rest would empty the queue by EXHAUSTING it rather than by delivering it — the
     * traveler's actions would quietly disappear on a bad afternoon.
     */
    expect(result.sent).toBe(0);
    expect(result.dropped).toBe(0);
    expect(await pendingCount()).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("drops an action the server refuses, rather than retrying forever", async () => {
    await enqueue("change_decision", { journeyId: "j1", eventId: "gone", optionId: "o1" });

    // A Change Card already answered from another device. A 404 will not become a 200.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.resolve(new Response("{}", { status: 404 }))),
    );

    const result = await flushOutbox();
    expect(result.dropped).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("retries a rate limit rather than dropping it", async () => {
    await enqueue("report_create", { entityId: "p1" });

    // 429 is "later", not "never" — the one 4xx worth keeping.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.resolve(new Response("{}", { status: 429 }))),
    );

    await flushOutbox();
    expect(await pendingCount()).toBe(1);
  });

  it("gives up after five attempts", async () => {
    await enqueue("report_create", { entityId: "p1" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.resolve(new Response("{}", { status: 503 }))),
    );

    // Enough to survive a bad afternoon, not enough to outlive the journey.
    for (let attempt = 0; attempt < 5; attempt += 1) await flushOutbox();

    expect(await pendingCount()).toBe(0);
  });

  it("drops an action from a build that no longer exists", async () => {
    await (
      await db()
    ).pending_actions.add({
      id: "legacy",
      action_type: "something_removed_in_a_later_release",
      payload: {},
      created_at: new Date().toISOString(),
      attempts: 0,
    });

    vi.stubGlobal("fetch", succeeding());

    // No endpoint can be built for it, so retrying would never help — and guessing at one
    // would replay it somewhere that no longer means what it did.
    expect((await flushOutbox()).dropped).toBe(1);
  });

  it("does nothing, safely, with an empty queue", async () => {
    vi.stubGlobal("fetch", succeeding());
    expect(await flushOutbox()).toEqual({ sent: 0, dropped: 0 });
  });

  it("can be cleared", async () => {
    await enqueue("report_create", { entityId: "p1" });
    await clearOutbox();
    expect(await pendingCount()).toBe(0);
  });
});
