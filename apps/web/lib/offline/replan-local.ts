import { evaluateChange, type ChangeCard, type ChangeTrigger } from "@mandhira/journey-engine";

import { toEngineJourney } from "../journey-types";
import { readSnapshot } from "./sync";

/**
 * Replanning with no network (PRD-OFFL-005, PRD-ADPT-007).
 *
 * This is the payoff for every constraint the engine has carried since B-016. It is pure,
 * it has no clock and no I/O, and its input is the Dexie snapshot byte-for-byte
 * (TRD-ARCH-002) — so the same `evaluateChange` that runs on the server runs here, over
 * the same bytes, and produces the same ladder.
 *
 * Which matters most in exactly the situation there is no signal: a traveler on a hillside
 * who has fallen forty minutes behind needs to know whether their evening aarti is still
 * reachable. That question is answerable from what is already on the device, and answering
 * it was the reason for keeping the engine pure.
 *
 * PRD-ADPT-007 draws the line precisely: USER-initiated triggers replan offline —
 * running late, staying longer, marking something done. External triggers (a knowledge
 * update, a transport feed) do not, because the information they are about has not
 * reached the device either.
 */
const OFFLINE_TRIGGERS = new Set(["user_late", "user_stay_longer", "user_done_delta"]);

export function isOfflineReplannable(kind: string): boolean {
  return OFFLINE_TRIGGERS.has(kind);
}

/**
 * Evaluate a trigger from the cached snapshot.
 *
 * Returns null when there is nothing cached, or when the trigger is one that cannot
 * honestly be evaluated offline. Null means "ask the server" — never "nothing to do".
 */
export async function replanLocally(
  journeyId: string,
  trigger: ChangeTrigger,
  nowAt: string,
): Promise<ChangeCard | null> {
  if (!isOfflineReplannable(trigger.kind)) return null;

  const snapshot = await readSnapshot(journeyId);
  if (!snapshot) return null;

  void nowAt;

  /*
   * No `travelers`. Traveler profiles are the most sensitive rows in the schema
   * (PRD-PRIV-002) and are deliberately NOT in the offline snapshot — so the offline
   * ladder is evaluated without them.
   *
   * The consequence is stated rather than hidden: buffer multipliers for a wheelchair user
   * or someone who needs frequent rest are not applied here, so an offline option can look
   * slightly more comfortable than it is. The alternative — caching mobility data on the
   * device — trades a privacy guarantee for a refinement, and this product does not make
   * that trade. The card carries the caveat (see `ChangeSheet`), and the next online
   * evaluation is authoritative.
   */
  return evaluateChange({
    journey: toEngineJourney(snapshot.journey),
    items: snapshot.items,
    knowledge: snapshot.bundle,
    trigger,
  });
}
