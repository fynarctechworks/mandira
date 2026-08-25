import {
  buildInitialJourney,
  computeHealth,
  generatePrepareTasks,
  scheduleDay,
  type BuildResult,
  type HealthReport,
  type PrepareTask,
  type ScheduleDayResult,
} from "@mandhira/journey-engine";
import * as Comlink from "comlink";

import type { EngineWorkerApi } from "./engine.worker";

/**
 * Above this many items the engine moves to a Web Worker (TRD §9).
 *
 * Below it, the round trip and the structured clone of the KnowledgeBundle cost more than
 * the computation saves. Above it, a health recompute on the main thread starts eating
 * into PRD F5's 500 ms budget while the traveler is mid-drag.
 */
export const WORKER_ITEM_THRESHOLD = 40;

export function shouldUseWorker(itemCount: number): boolean {
  return itemCount > WORKER_ITEM_THRESHOLD && typeof Worker !== "undefined";
}

type BuildInput = Parameters<typeof buildInitialJourney>[0];
type HealthInput = Parameters<typeof computeHealth>[0];
type ScheduleInput = Parameters<typeof scheduleDay>[0];
type PrepareInput = Parameters<typeof generatePrepareTasks>[0];

/**
 * One async surface over both execution paths.
 *
 * Callers never learn which thread ran their request. If the choice leaked into the API,
 * every call site would have to handle two shapes, and the threshold would stop being an
 * implementation detail we can tune.
 */
export type EngineClient = {
  buildInitialJourney(input: BuildInput): Promise<BuildResult>;
  computeHealth(input: HealthInput): Promise<HealthReport>;
  scheduleDay(input: ScheduleInput): Promise<ScheduleDayResult>;
  generatePrepareTasks(input: PrepareInput): Promise<PrepareTask[]>;
  /** Release the worker. Safe to call when none was ever started. */
  dispose(): void;
};

export type WorkerFactory = () => Worker;

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });

export function createEngineClient(options: { workerFactory?: WorkerFactory } = {}): EngineClient {
  const factory = options.workerFactory ?? defaultWorkerFactory;

  let worker: Worker | null = null;
  let remote: Comlink.Remote<EngineWorkerApi> | null = null;

  // Started on the first call that needs it, not at import: most journeys never cross the
  // threshold, and a worker spun up on every page load is a cost paid by everyone for the
  // benefit of a few.
  function connect(): Comlink.Remote<EngineWorkerApi> {
    if (!remote) {
      worker = factory();
      remote = Comlink.wrap<EngineWorkerApi>(worker);
    }
    return remote;
  }

  /**
   * A worker failure falls back to running in-process rather than surfacing an error.
   *
   * The engine is what tells a traveler whether their day still works. If the worker
   * cannot start — a blocked blob URL, an out-of-memory tab, an offline cache miss — the
   * answer is slower, not absent.
   */
  async function run<TInput, TOutput>(
    input: TInput,
    itemCount: number,
    local: (input: TInput) => TOutput,
    viaWorker: (api: Comlink.Remote<EngineWorkerApi>, input: TInput) => Promise<TOutput>,
  ): Promise<TOutput> {
    if (!shouldUseWorker(itemCount)) return local(input);

    try {
      return await viaWorker(connect(), input);
    } catch {
      dispose();
      return local(input);
    }
  }

  function dispose() {
    remote?.[Comlink.releaseProxy]();
    worker?.terminate();
    remote = null;
    worker = null;
  }

  return {
    buildInitialJourney: (input) =>
      run(
        input,
        briefItemCount(input),
        buildInitialJourney,
        (api, i) => api.buildInitialJourney(i) as Promise<BuildResult>,
      ),
    computeHealth: (input) =>
      run(
        input,
        input.items.length,
        computeHealth,
        (api, i) => api.computeHealth(i) as Promise<HealthReport>,
      ),
    scheduleDay: (input) =>
      run(
        input,
        input.items.length,
        scheduleDay,
        (api, i) => api.scheduleDay(i) as Promise<ScheduleDayResult>,
      ),
    generatePrepareTasks: (input) =>
      run(
        input,
        input.items.length,
        generatePrepareTasks,
        (api, i) => api.generatePrepareTasks(i) as Promise<PrepareTask[]>,
      ),
    dispose,
  };
}

/** A build has no items yet, so the brief's own length is what predicts the work. */
function briefItemCount(input: BuildInput): number {
  const { brief } = input;
  return (
    (brief.must_do?.length ?? 0) +
    (brief.would_like?.length ?? 0) +
    (brief.might_do?.length ?? 0) +
    (brief.fixed_commitments?.length ?? 0)
  );
}
