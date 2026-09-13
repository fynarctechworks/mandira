import type { Translate } from "../engine-text";
import { assembleLiveView, type LivePlace, type LiveView } from "../live-view";
import { readSnapshot } from "./sync";

/**
 * The Live Journey view, built entirely in the browser from IndexedDB (PRD-OFFL-002).
 *
 * This is what makes airplane mode work. It calls the SAME `assembleLiveView` the server
 * calls, with the same engine, over the snapshot that TRD-ARCH-002 requires to be the
 * server's bytes — so the plan a traveler reads on a hillside with no signal is the plan
 * they were shown that morning, not an approximation of it.
 *
 * The clock, though, is the live one. That distinction is the whole feature: stale DATA
 * with a real clock is a usable answer, and it is the only honest one available offline.
 * Fresh-looking data with a frozen clock is what a naively cached page gives you, and it
 * is the failure this exists to prevent — a NOW card is only ever right for one minute.
 */
export async function readLiveViewLocally(
  journeyId: string,
  locale: string,
  nowAt: string,
  /** The screen's own translator — the wording is the catalogs', offline as online. */
  t: Translate,
): Promise<LiveView | null> {
  const snapshot = await readSnapshot(journeyId);
  if (!snapshot) return null;

  const labels = new Map<string, string>();
  const places = new Map<string, LivePlace>();

  for (const entity of snapshot.entities) {
    const payload = entity.payload;
    const names = (payload["name_i18n"] ?? {}) as Record<string, string>;
    // Falls back to English rather than to a blank: an untranslated name is a name, and a
    // card labelled with nothing at all is not.
    const name = names[locale] ?? names["en"] ?? "";

    if (entity.entity_table === "experiences") {
      labels.set(entity.id, name);
    }

    if (entity.entity_table === "places") {
      labels.set(entity.id, name);
      places.set(entity.id, {
        name,
        latitude: (payload["latitude"] as number | null) ?? null,
        longitude: (payload["longitude"] as number | null) ?? null,
      });
    }
  }

  return assembleLiveView({
    journey: snapshot.journey,
    items: snapshot.items,
    bundle: snapshot.bundle,
    labels,
    places,
    nowAt,
    syncedAt: snapshot.syncedAt,
    t,
  });
}
