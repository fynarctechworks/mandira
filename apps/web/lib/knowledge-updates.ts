import { evaluateTrigger, type ChangeEvent } from "./changes";
import { mustList, mustWrite } from "./data-error";
import type { StoredItem } from "./journey-types";
import { getJourney } from "./journeys";
import type { webSupabase } from "./supabase";

/**
 * Published knowledge changing, reaching the journeys that contain it (PRD-OPS-WF-007).
 *
 * The other half of `knowledge_updates`. Ops records that an entity was republished; this
 * runs in the TRAVELER'S session, notices an update touching one of their items, and raises
 * the `knowledge_update` trigger that has sat unused in `change_trigger_enum` since 0001.
 *
 * WHY IT LIVES HERE AND NOT IN OPS. Evaluating a Change Card needs the travelers — mobility
 * drives buffers and the physical-load check — and `traveler_profiles` has no Ops policy at
 * all (CLAUDE.md §5). So Ops cannot do this on anybody's behalf and must not try. Running it
 * on the traveler's own session is not a workaround; it is the only place the data legally
 * exists together.
 *
 * And it produces a CARD, never an edit. An operator correcting a temple's evening timing
 * must not silently move somebody's evening — PRD Principle 6 does not have an exception
 * for changes that are obviously right.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * Raises at most ONE trigger per check, and returns the card if there is one.
 *
 * One, not one per changed entity. A destination correcting four things overnight is one
 * piece of news to somebody eating breakfast, and four Change Cards in a row is how a
 * traveler learns to dismiss them without reading.
 */
export async function checkKnowledgeUpdates(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<ChangeEvent | null> {
  const detail = await getJourney(supabase, journeyId, locale);
  if (!detail) return null;

  const { journey, items } = detail;

  // A journey that is over hears nothing. A correction to yesterday is not news, and a
  // Change Card about a day that has happened has no options worth offering.
  const lastDay = journey.endDate ?? journey.startDate;
  if (!lastDay || lastDay < today(journey.timezone)) return null;

  const since = journey.knowledgeCheckedAt;

  /*
   * A journey that has never been checked is treated as having seen everything up to now.
   * Otherwise switching this on would greet every existing traveler with a backlog of every
   * publish since the destination went live — which is noise, not news.
   */
  if (!since) {
    await markChecked(supabase, journeyId);
    return null;
  }

  const updates = mustList(
    await supabase
      .from("knowledge_updates")
      .select("entity_table, entity_id, changed_fields, published_at")
      .gt("published_at", since)
      .order("published_at", { ascending: false })
      .limit(100),
    "knowledge_updates",
  );

  if (updates.length === 0) {
    await markChecked(supabase, journeyId);
    return null;
  }

  // Only what is still ahead of them. A change to an item they already did is history.
  const upcoming = items.filter((item) => !isPast(item, journey.timezone));
  const touched = updates.find((update) => upcoming.some((item) => matches(item, update)));

  /*
   * The clock advances either way. If nothing touched this journey the updates have been
   * genuinely considered, and leaving the mark behind would make every load re-read the
   * same rows and find the same nothing.
   */
  await markChecked(supabase, journeyId);
  if (!touched) return null;

  const item = upcoming.find((candidate) => matches(candidate, touched));

  return evaluateTrigger(
    supabase,
    journeyId,
    {
      kind: "knowledge_update",
      dayIndex: item?.day_index ?? 0,
      ...(item ? { itemId: item.id } : {}),
    },
    locale,
  );
}

/** Whether this update is about something the journey actually contains. */
function matches(item: StoredItem, update: { entity_table: string; entity_id: string }): boolean {
  switch (update.entity_table) {
    case "experiences":
      return item.experience_id === update.entity_id;
    case "places":
      return item.place_id === update.entity_id;
    case "routes":
      return item.route_id === update.entity_id;
    case "transport_connections":
      return item.transport_connection_id === update.entity_id;
    default:
      /*
       * A destination, guidance block, phrase or advisory changing touches no single item.
       * It is real news and it is not a scheduling change, so it belongs in Prepare or on
       * the destination page rather than in a Change Card that would have no options to
       * offer beyond "keep as is".
       */
      return false;
  }
}

/** Whether the item's day is behind the traveler, in the journey's own timezone. */
function isPast(item: StoredItem, timezone: string): boolean {
  if (!item.planned_end_at) return false;
  return item.planned_end_at < nowInstant(timezone);
}

async function markChecked(supabase: Client, journeyId: string): Promise<void> {
  mustWrite(
    await supabase
      .from("journeys")
      .update({ knowledge_checked_at: new Date().toISOString() })
      .eq("id", journeyId),
    "journeys update",
  );
}

/** Today's date in the journey's timezone, so day boundaries fall where the traveler is. */
function today(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function nowInstant(_timeZone: string): string {
  // Instants are absolute; the timezone matters for DAY boundaries (above), not for this
  // comparison. Kept as a parameter so the two uses read the same at the call site.
  return new Date().toISOString();
}
