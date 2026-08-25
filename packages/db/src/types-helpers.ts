import type { Database } from "../types";

/**
 * Convenience aliases over the generated `Database` type, so callers write
 * `Tables<"places">` instead of the full nested path.
 */
export type Schema = Database["public"];

export type Tables<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Schema["Tables"]> = Schema["Tables"][T]["Update"];
export type Views<T extends keyof Schema["Views"]> = Schema["Views"][T]["Row"];
export type Enums<T extends keyof Schema["Enums"]> = Schema["Enums"][T];

/**
 * The traveler-facing knowledge types. These come from the `v_published_*` views, not
 * the base tables — travelers read nothing else (TRD-ARCH-004, D-029). Importing the
 * view row type rather than the table row type is what keeps that boundary visible in
 * application code.
 */
export type PublishedDestination = Views<"v_published_destinations">;
export type PublishedPlace = Views<"v_published_places">;
export type PublishedExperience = Views<"v_published_experiences">;
export type PublishedAvailabilityRule = Views<"v_published_availability_rules">;
export type PublishedRoute = Views<"v_published_routes">;
export type PublishedTransportConnection = Views<"v_published_transport_connections">;
export type PublishedGuidanceBlock = Views<"v_published_guidance_blocks">;
export type PublishedPhrase = Views<"v_published_phrases">;
export type PublishedAdvisory = Views<"v_published_advisories">;
