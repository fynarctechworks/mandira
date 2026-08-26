import { db, offlineAvailable } from "./db";

/**
 * The offline outbox (PRD-OFFL-004, TRD §4.7 `pending_actions`).
 *
 * What a traveler DID while they had no signal, waiting to be told to the server. Three
 * action types, exactly as the TRD names them — a report they filed at a closed gate, an
 * item they marked done, a Change Card they answered.
 *
 * The ordering rule is the important one: actions are replayed in the order they were
 * taken. Someone who marked an item done and then answered a Change Card about the rest of
 * their day did those things in that sequence, and replaying them the other way round
 * would evaluate the card against a day that had not happened yet.
 *
 * Nothing here retries forever. An action that has failed repeatedly is either malformed
 * or aimed at something that no longer exists, and a queue that keeps trying is a queue
 * that never drains — so it is dropped after a bounded number of attempts, and the
 * traveler is never shown an error about it (PRD-OFFL-003 forbids the dialog).
 */
export type PendingActionType = "report_create" | "item_status_update" | "change_decision";

/**
 * The stored row, narrowed.
 *
 * Dexie types `action_type` as `string` because IndexedDB will happily hand back whatever
 * an older build wrote. Narrowing here rather than in the store means an unrecognised type
 * from a previous version falls through `endpointFor` to null and is dropped, instead of
 * being replayed at an endpoint that no longer means what it did.
 */
export type PendingAction = {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
};

/**
 * Past this, the action is dropped rather than retried.
 *
 * Five is chosen to survive a bad afternoon — several failed reconnects on a train — while
 * not outliving the journey it belongs to. An item-status update from last Tuesday is not
 * worth sending.
 */
const MAX_ATTEMPTS = 5;

/** Where each action type is sent. `journeyId` and `itemId` come from the payload. */
function endpointFor(action: PendingAction): { url: string; method: string } | null {
  const payload = action.payload as Record<string, string>;

  switch (action.action_type) {
    case "report_create":
      return { url: "/api/reports", method: "POST" };

    case "item_status_update":
      return payload["journeyId"] && payload["itemId"]
        ? {
            url: `/api/journeys/${payload["journeyId"]}/items/${payload["itemId"]}/status`,
            method: "PATCH",
          }
        : null;

    case "change_decision":
      return payload["journeyId"] && payload["eventId"]
        ? {
            url: `/api/journeys/${payload["journeyId"]}/changes/${payload["eventId"]}`,
            method: "POST",
          }
        : null;

    default:
      // An action type this build does not know — written by an older one, and dropped
      // rather than guessed at.
      return null;
  }
}

/** The body actually sent, with the routing fields stripped back out. */
function bodyFor(action: PendingAction): Record<string, unknown> {
  const { journeyId, itemId, eventId, ...body } = action.payload as Record<string, unknown>;

  // `journeyId` stays on a report, where it is a real field rather than a route parameter.
  if (action.action_type === "report_create" && journeyId) {
    return { ...body, journeyId };
  }

  void itemId;
  void eventId;
  return body;
}

export async function enqueue(
  type: PendingActionType,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!offlineAvailable()) return;

  try {
    await (
      await db()
    ).pending_actions.add({
      id: crypto.randomUUID(),
      action_type: type,
      payload,
      created_at: new Date().toISOString(),
      attempts: 0,
    });
  } catch {
    // An action that could not be queued is lost, and that is better than an exception
    // reaching a traveler mid-journey (PRD-OFFL-003).
  }
}

export async function pendingCount(): Promise<number> {
  if (!offlineAvailable()) return 0;
  try {
    return await (await db()).pending_actions.count();
  } catch {
    return 0;
  }
}

/**
 * Send everything waiting, oldest first.
 *
 * Stops at the first network failure rather than working through the rest: if one request
 * could not reach the server, the next will not either, and burning four more attempts on
 * each queued action would empty the queue by exhausting it instead of by delivering it.
 */
export async function flushOutbox(): Promise<{ sent: number; dropped: number }> {
  if (!offlineAvailable()) return { sent: 0, dropped: 0 };

  let sent = 0;
  let dropped = 0;

  try {
    const database = await db();
    const queued = await database.pending_actions.orderBy("created_at").toArray();

    for (const action of queued) {
      const target = endpointFor(action);

      if (!target) {
        // Malformed — no endpoint can be built from it. Retrying will never help.
        await database.pending_actions.delete(action.id);
        dropped += 1;
        continue;
      }

      let response: Response;

      try {
        response = await fetch(target.url, {
          method: target.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bodyFor(action)),
        });
      } catch {
        // Still offline. Leave everything where it is and stop — see the comment above.
        return { sent, dropped };
      }

      if (response.ok) {
        await database.pending_actions.delete(action.id);
        sent += 1;
        continue;
      }

      /*
       * A 4xx will not become a 2xx on the tenth try. The commonest case is an action
       * aimed at something that has since been removed, or a Change Card already answered
       * from another device — both are "no longer applicable", not "try again".
       */
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        await database.pending_actions.delete(action.id);
        dropped += 1;
        continue;
      }

      const attempts = action.attempts + 1;

      if (attempts >= MAX_ATTEMPTS) {
        await database.pending_actions.delete(action.id);
        dropped += 1;
      } else {
        await database.pending_actions.update(action.id, { attempts });
      }
    }
  } catch {
    return { sent, dropped };
  }

  return { sent, dropped };
}

/** Used when a journey is forgotten, so its queued actions go with it. */
export async function clearOutbox(): Promise<void> {
  if (!offlineAvailable()) return;
  try {
    await (await db()).pending_actions.clear();
  } catch {
    // Nothing to tell anyone: a queue that failed to clear is not the traveler's problem.
  }
}
