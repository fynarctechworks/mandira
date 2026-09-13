import {
  applyOption,
  evaluateChange,
  type ChangeCard,
  type ChangeTrigger,
  type ItemChange,
} from "@mandhira/journey-engine";

import type { Database, Json } from "@mandhira/db/types";

import { mustMaybe, mustWrite } from "./data-error";
import { getJourney, toEngineJourney, travelersFor } from "./journeys";
import { getKnowledgeBundle } from "./knowledge";
import type { webSupabase } from "./supabase";

/**
 * Adaptive replanning (PRD F6, ADPT-01..03).
 *
 * The engine decides what could be done; this decides nothing. Every function here either
 * READS to build a card, or WRITES a decision the traveler has already made — the two are
 * separate calls with a tap in between, because PRD-ADPT-005 allows nothing to be applied
 * without one.
 *
 * That separation is also why the card is persisted before it is answered: a traveler is
 * shown options computed at one instant, and the option they eventually tap has to be the
 * one they were shown, not a recomputation against a journey that moved underneath them.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export { travelersFor };

export type ChangeEvent = {
  id: string;
  card: ChangeCard;
  decidedAt: string | null;
};

/**
 * Evaluate a trigger and record the card.
 *
 * Returns null when the journey is unreachable. A `no_impact` outcome still returns a card
 * — the CALLER decides that a quiet toast is the right response (PRD-ADPT-005), because
 * only the caller knows whether the traveler asked for this or a background feed did.
 */
export async function evaluateTrigger(
  supabase: Client,
  journeyId: string,
  trigger: ChangeTrigger,
  locale: string,
): Promise<ChangeEvent | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items } = detail;
  const knowledge = journey.destinationId
    ? await getKnowledgeBundle(journey.destinationId, locale)
    : EMPTY_BUNDLE;

  const card = evaluateChange({
    journey: toEngineJourney(journey),
    items,
    knowledge,
    travelers: await travelersFor(supabase, journeyId),
    trigger,
  });

  /*
   * Persisted even when nothing is offered. `journey_change_events` is the record of what
   * the product noticed and what it proposed — a row only written when options existed
   * would make the log say the system never saw the quiet days.
   */
  const data = mustMaybe(
    await supabase
      .from("journey_change_events")
      .insert({
        journey_id: journeyId,
        trigger: trigger.kind,
        trigger_payload: trigger as unknown as Json,
        impact: { outcome: card.outcome },
        change_card: card as unknown as Json,
      })
      .select("id, decided_at")
      .maybeSingle(),
    "journey_change_events insert",
  );

  if (!data?.id) return null;

  return { id: data.id, card, decidedAt: data.decided_at };
}

/**
 * Apply the option the traveler tapped, or record that they kept things as they are.
 *
 * `optionId` of null IS a decision and is recorded as one. "Keep as is" is a choice PRD F6
 * requires to be offered, and a log that only records changes would show a traveler who
 * declined three times as a traveler who was never asked.
 */
export async function decideChange(
  supabase: Client,
  journeyId: string,
  eventId: string,
  optionId: string | null,
  locale: string,
): Promise<{ applied: ItemChange[]; outcome: "applied" | "kept"; days: number[] } | null> {
  const event = mustMaybe(
    await supabase
      .from("journey_change_events")
      .select("id, change_card, decided_at")
      .eq("id", eventId)
      .eq("journey_id", journeyId)
      .maybeSingle(),
    "journey_change_events",
  );

  if (!event?.id) return null;

  // Already answered. Re-applying would double-move every item in the option.
  if (event.decided_at) return null;

  const card = event.change_card as unknown as ChangeCard | null;
  if (!card) return null;

  if (optionId === null) {
    mustWrite(
      await supabase
        .from("journey_change_events")
        .update({ decided_at: new Date().toISOString(), chosen_option_index: null })
        .eq("id", eventId),
      "journey_change_events update",
    );

    return { applied: [], outcome: "kept", days: [] };
  }

  const index = card.options.findIndex((option) => option.id === optionId);
  const option = card.options[index];
  if (!option) return null;

  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  /*
   * The engine applies the option to produce the new items. It is the same function that
   * generated them, over absolute targets rather than deltas — so applying what the
   * traveler was SHOWN lands exactly where the card said it would, whatever else has
   * happened since.
   */
  const { appliedChanges } = applyOption({ items: detail.items, option });

  await writeChanges(supabase, journeyId, appliedChanges, detail.items);

  mustWrite(
    await supabase
      .from("journey_change_events")
      .update({
        decided_at: new Date().toISOString(),
        chosen_option_index: index,
        applied_changes: appliedChanges as unknown as Json,
      })
      .eq("id", eventId),
    "journey_change_events update",
  );

  // Every day an item left or arrived on, so the caller puts exactly those back on the clock.
  const dayOf = new Map(detail.items.map((item) => [item.id, item.day_index]));
  const days = [
    ...new Set(
      appliedChanges.flatMap((change) => [
        ...(dayOf.has(change.itemId) ? [dayOf.get(change.itemId)!] : []),
        ...(change.op === "move_day" ? [change.toDayIndex] : []),
      ]),
    ),
  ];

  return { applied: appliedChanges, outcome: "applied", days };
}

/**
 * Persist the engine's operations.
 *
 * Written one operation at a time rather than as a bulk replace of the day, so a change
 * touches exactly the items it names. A bulk write would rewrite rows the option never
 * mentioned, and the first thing lost that way is something the traveler edited by hand a
 * minute earlier.
 */
async function writeChanges(
  supabase: Client,
  journeyId: string,
  changes: ItemChange[],
  current: readonly { id: string; buffer_minutes?: number | null }[],
): Promise<void> {
  const bufferOf = new Map(current.map((item) => [item.id, item.buffer_minutes ?? 0]));

  for (const change of changes) {
    // Typed as the table's Update row, so a column-name typo is a compile error rather
    // than an update that silently changes nothing.
    const patch: Database["public"]["Tables"]["journey_items"]["Update"] = {};

    switch (change.op) {
      case "remove":
        // Soft, like every other removal (B-019): a traveler who accepts the wrong option
        // in a queue at 5am should not have destroyed anything.
        patch.deleted_at = new Date().toISOString();
        break;
      case "absorb_buffer":
        /*
         * `byMinutes` is how much of the buffer is spent, not what is left of it — the engine
         * applies it as `buffer − byMinutes` (applyOption). Writing it as the new buffer
         * turned "use 10 of this 25-minute buffer" into a 10-minute buffer here and a
         * 15-minute one on the card the traveler accepted.
         */
        patch.buffer_minutes = Math.max(0, (bufferOf.get(change.itemId) ?? 0) - change.byMinutes);
        break;
      case "set_window":
        patch.preferred_window_start = change.startTime;
        break;
      case "shorten":
        patch.duration_likely_minutes = change.toMinutes;
        break;
      case "move_day":
        patch.day_index = change.toDayIndex;
        break;
    }

    mustWrite(
      await supabase
        .from("journey_items")
        .update(patch)
        .eq("id", change.itemId)
        .eq("journey_id", journeyId),
      "journey_items update",
    );
  }
}

const EMPTY_BUNDLE = {
  places: [],
  experiences: [],
  availability_rules: [],
  routes: [],
  transport_connections: [],
  travel_estimates: [],
  trust: {},
};
