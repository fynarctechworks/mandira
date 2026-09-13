import { getI18n } from "@mandhira/i18n";

import { mustList, mustMaybe, mustWrite } from "./data-error";
import type { webSupabase } from "./supabase";

/**
 * Saved places (PRD F13, A22).
 *
 * A saved row is only a pointer. Names and links are read through the published views every
 * time, so a place Ops later unpublishes simply stops appearing rather than lingering with
 * whatever it was called when it was saved.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

export type SavedPlace = {
  placeId: string;
  name: string;
  destinationName: string;
  /** Locale-less path; the caller prefixes the locale. */
  path: string;
};

export async function listSavedPlaces(
  supabase: Client,
  userId: string,
  locale: string,
): Promise<SavedPlace[]> {
  const saved = mustList(
    await supabase
      .from("saved_places")
      .select("place_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "saved_places",
  );
  if (saved.length === 0) return [];

  const places = mustList(
    await supabase
      .from("v_published_places")
      .select("id, slug, name_i18n, destination_id")
      .in(
        "id",
        saved.map((row) => row.place_id),
      ),
    "v_published_places",
  );

  const destinationIds = [
    ...new Set(places.map((place) => place.destination_id).filter((id): id is string => !!id)),
  ];
  const destinations = destinationIds.length
    ? mustList(
        await supabase
          .from("v_published_destinations")
          .select("id, slug, name_i18n")
          .in("id", destinationIds),
        "v_published_destinations",
      )
    : [];

  const placeById = new Map(places.map((place) => [place.id, place]));
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));

  return saved.flatMap((row) => {
    const place = placeById.get(row.place_id);
    const destination = place?.destination_id ? destinationById.get(place.destination_id) : null;
    if (!place?.id || !place.slug || !destination?.slug) return [];

    return [
      {
        placeId: place.id,
        name: getI18n(place.name_i18n as Record<string, string> | null, locale).text,
        destinationName: getI18n(destination.name_i18n as Record<string, string> | null, locale)
          .text,
        path: `/destinations/${destination.slug}/places/${place.slug}`,
      },
    ];
  });
}

export async function isPlaceSaved(
  supabase: Client,
  userId: string,
  placeId: string,
): Promise<boolean> {
  const row = mustMaybe(
    await supabase
      .from("saved_places")
      .select("place_id")
      .eq("user_id", userId)
      .eq("place_id", placeId)
      .maybeSingle(),
    "saved_places",
  );
  return row !== null;
}

/** False when the place is not published, so nothing unpublished can be bookmarked. */
export async function savePlace(
  supabase: Client,
  userId: string,
  placeId: string,
): Promise<boolean> {
  const place = mustMaybe(
    await supabase.from("v_published_places").select("id").eq("id", placeId).maybeSingle(),
    "v_published_places",
  );
  if (!place) return false;

  mustWrite(
    await supabase
      .from("saved_places")
      .upsert(
        { user_id: userId, place_id: placeId },
        { onConflict: "user_id,place_id", ignoreDuplicates: true },
      ),
    "saved_places upsert",
  );
  return true;
}

export async function unsavePlace(
  supabase: Client,
  userId: string,
  placeId: string,
): Promise<void> {
  mustWrite(
    await supabase.from("saved_places").delete().eq("user_id", userId).eq("place_id", placeId),
    "saved_places delete",
  );
}
