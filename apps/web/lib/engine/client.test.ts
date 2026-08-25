import {
  computeHealth,
  type Journey,
  type JourneyItem,
  type KnowledgeBundle,
} from "@mandhira/journey-engine";
import * as Comlink from "comlink";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEngineClient, shouldUseWorker, WORKER_ITEM_THRESHOLD } from "./client";

const journey: Journey = {
  id: "j1",
  start_date: "2026-10-12",
  timezone: "Asia/Kolkata",
  day_start_time: "06:00",
  day_end_time: "21:00",
};

const knowledge: KnowledgeBundle = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
};

const items = (count: number): JourneyItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `i${i}`,
    day_index: i % 3,
    sort_order: i,
    item_type: "experience" as const,
    tier: "important" as const,
    duration_likely_minutes: 30,
  }));

/**
 * A real Comlink endpoint backed by a MessageChannel, standing in for a Worker.
 *
 * jsdom has no Worker, and a hand-written stub would test the stub rather than the
 * protocol. This exercises the same serialise/dispatch path a browser would.
 */
function fakeWorker(api: Record<string, unknown>) {
  const channel = new MessageChannel();
  Comlink.expose(api, channel.port2);
  channel.port2.start();
  channel.port1.start();

  return Object.assign(channel.port1, {
    terminate: vi.fn(() => {
      channel.port1.close();
      channel.port2.close();
    }),
  }) as unknown as Worker;
}

const originalWorker = globalThis.Worker;

afterEach(() => {
  if (originalWorker) globalThis.Worker = originalWorker;
  else delete (globalThis as { Worker?: unknown }).Worker;
});

/** jsdom has no Worker constructor, and `shouldUseWorker` checks for one. */
function withWorkerSupport() {
  (globalThis as { Worker?: unknown }).Worker = class {};
}

describe("shouldUseWorker", () => {
  it("keeps small journeys on the main thread", () => {
    withWorkerSupport();
    expect(shouldUseWorker(WORKER_ITEM_THRESHOLD)).toBe(false);
    expect(shouldUseWorker(WORKER_ITEM_THRESHOLD + 1)).toBe(true);
  });

  it("stays on the main thread where there is no Worker at all", () => {
    delete (globalThis as { Worker?: unknown }).Worker;
    expect(shouldUseWorker(500)).toBe(false);
  });
});

describe("createEngineClient", () => {
  it("answers a small journey without ever starting a worker", async () => {
    withWorkerSupport();
    const workerFactory = vi.fn(() => fakeWorker({}));
    const client = createEngineClient({ workerFactory });

    const report = await client.computeHealth({ journey, items: items(5), knowledge });

    expect(workerFactory).not.toHaveBeenCalled();
    expect(report).toEqual(computeHealth({ journey, items: items(5), knowledge }));
    client.dispose();
  });

  it("moves a large journey to the worker and reuses it", async () => {
    withWorkerSupport();
    const workerFactory = vi.fn(() => fakeWorker({ computeHealth }));
    const client = createEngineClient({ workerFactory });

    const large = items(WORKER_ITEM_THRESHOLD + 1);
    const first = await client.computeHealth({ journey, items: large, knowledge });
    await client.computeHealth({ journey, items: large, knowledge });

    expect(workerFactory).toHaveBeenCalledTimes(1);
    expect(first).toEqual(computeHealth({ journey, items: large, knowledge }));
    client.dispose();
  });

  it("answers on the main thread when the worker cannot", async () => {
    withWorkerSupport();
    const client = createEngineClient({
      workerFactory: () => {
        throw new Error("blocked");
      },
    });

    const large = items(WORKER_ITEM_THRESHOLD + 1);
    // Slower, but the traveler still learns whether their day works.
    await expect(client.computeHealth({ journey, items: large, knowledge })).resolves.toEqual(
      computeHealth({ journey, items: large, knowledge }),
    );
  });

  it("terminates the worker on dispose, and tolerates disposing twice", async () => {
    withWorkerSupport();
    let created: Worker | null = null;
    const client = createEngineClient({
      workerFactory: () => {
        created = fakeWorker({ computeHealth });
        return created;
      },
    });

    await client.computeHealth({ journey, items: items(WORKER_ITEM_THRESHOLD + 1), knowledge });
    client.dispose();
    client.dispose();

    expect(created!.terminate).toHaveBeenCalledTimes(1);
  });

  it("counts a build from the brief, which has no items yet", async () => {
    withWorkerSupport();
    const workerFactory = vi.fn(() => fakeWorker({}));
    const client = createEngineClient({ workerFactory });

    const result = await client.buildInitialJourney({
      brief: { start_date: "2026-10-12", day_count: 2 },
      knowledge,
    });

    expect(workerFactory).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    client.dispose();
  });
});
