import {
  buildInitialJourney,
  computeHealth,
  generatePrepareTasks,
  scheduleDay,
} from "@mandhira/journey-engine";
import * as Comlink from "comlink";

/**
 * The journey engine, running off the main thread.
 *
 * Only the four entry points are exposed. Everything they need arrives in the message —
 * the engine has no network, no database and no clock of its own (D-005), so a worker is
 * simply a second place it runs, not a second implementation to keep in step.
 */
const api = {
  buildInitialJourney,
  computeHealth,
  scheduleDay,
  generatePrepareTasks,
};

export type EngineWorkerApi = typeof api;

Comlink.expose(api);
