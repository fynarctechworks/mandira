/**
 * The NOW card's practical chips (PRD F8: "practical chips (restroom 120 m, water,
 * cloakroom)").
 *
 * PURE, like the rest of the Live view: the same facilities come from Postgres online and
 * from the snapshot offline, and the chips must agree. For each kind, the nearest published
 * facility of that kind within a short walk of where the traveler is now, as a straight-line
 * distance rounded to 10 m. Straight-line is honest for "which way is the nearest restroom";
 * it is not a route, and the chip does not pretend to be one.
 */
export type Facility = { subtype: string; latitude: number; longitude: number };

export type PracticalChip = { subtype: (typeof CHIP_SUBTYPES)[number]; meters: number };

/** PRD F8's three, in the order a traveler standing in a queue tends to need them. */
export const CHIP_SUBTYPES = ["restroom", "drinking_water", "cloakroom"] as const;

/** Past this it is not "nearby" any more, and a chip would send someone on a trek. */
const WITHIN_METERS = 1000;

export function practicalChips(
  at: { latitude: number | null; longitude: number | null } | null,
  facilities: Facility[],
): PracticalChip[] {
  if (!at || at.latitude == null || at.longitude == null) return [];
  const here = { latitude: at.latitude, longitude: at.longitude };

  return CHIP_SUBTYPES.flatMap((subtype) => {
    const nearest = facilities
      .filter((facility) => facility.subtype === subtype)
      .map((facility) => distanceMeters(here, facility))
      .sort((a, b) => a - b)[0];

    return nearest != null && nearest <= WITHIN_METERS
      ? [{ subtype, meters: Math.max(10, Math.round(nearest / 10) * 10) }]
      : [];
  });
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}
