import { z } from "zod";

import { mustList, mustMaybe } from "./data-error";
import type { webSupabase } from "./supabase";

/**
 * Share links for the read-only Journey Summary (PRD-PREP-004, TRD-SEC-004).
 *
 * Minting and revoking go through the traveler's own client, so RLS on `journey_shares`
 * is what stops anyone minting a link to a journey they do not own.
 *
 * READING is the interesting half. A token holder is signed out, so nothing about them
 * satisfies `owns_journey` — the read goes through `share_summary()`, a SECURITY DEFINER
 * function that names every column it returns and cannot be made to hand back
 * `traveler_profiles`, an item note, or the owner's identity. That projection is in SQL
 * rather than here on purpose: see the 0019 migration header.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

/** TRD §5.2: a share link is useful for a trip, not forever. */
const DEFAULT_TTL_DAYS = 30;

/**
 * The projection's shape, validated rather than asserted.
 *
 * `share_summary` returns `jsonb`, so the generated types can only call it `Json` — which
 * means a cast here would be the one place in the app where the database's shape is taken
 * on faith. If the SQL and this file ever drift, parsing turns that into an honest 404
 * instead of a page rendering `undefined` where the times should be.
 */
const itemSchema = z.object({
  id: z.string(),
  dayIndex: z.number(),
  sortOrder: z.number(),
  itemType: z.string(),
  tier: z.enum(["fixed", "protected", "important", "optional"]),
  plannedStartAt: z.string().nullable(),
  plannedEndAt: z.string().nullable(),
  durationLikelyMinutes: z.number().nullable(),
  bufferMinutes: z.number().nullable(),
  label: z.string().nullable(),
  entryRequirements: z.string().nullable(),
  dressCode: z.string().nullable(),
});

const summarySchema = z.object({
  journey: z.object({
    title: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    timezone: z.string(),
    dayStartTime: z.string(),
    dayEndTime: z.string(),
    pace: z.string(),
  }),
  items: z.array(itemSchema),
  facilities: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      subtype: z.string().nullable(),
      address: z.string().nullable(),
    }),
  ),
});

export type SharedItem = z.infer<typeof itemSchema>;
export type SharedSummary = z.infer<typeof summarySchema>;

/**
 * A 32-byte token (TRD-SEC-004), base64url so it survives being pasted into a chat app.
 *
 * `crypto.getRandomValues`, never `Math.random` — a guessable share token is a public
 * journey, and the whole point of the token is that it cannot be guessed.
 */
export function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createShare(
  supabase: Client,
  journeyId: string,
  userId: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const token = mintToken();
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_DAYS * 86_400_000).toISOString();

  const result = await supabase
    .from("journey_shares")
    .insert({ journey_id: journeyId, token, expires_at: expiresAt, created_by: userId })
    .select("token, expires_at")
    .maybeSingle();

  // RLS refuses an insert for a journey the caller does not own; that arrives as 42501 or
  // as no row, and both mean the same thing to the caller. Anything else is an outage.
  if (result.error?.code === RLS_REFUSED) return null;
  const data = mustMaybe(result, "journey_shares insert");

  if (!data?.token) return null;
  return { token: data.token, expiresAt: data.expires_at ?? expiresAt };
}

const RLS_REFUSED = "42501";

/**
 * Revocation is a hard delete, not a flag.
 *
 * A revoked token should leave nothing behind that could be un-revoked by a later bug or
 * a careless migration. This is the one place in the schema where forgetting is the
 * safer behaviour.
 */
export async function revokeShares(supabase: Client, journeyId: string): Promise<number> {
  const data = mustList(
    await supabase.from("journey_shares").delete().eq("journey_id", journeyId).select("id"),
    "journey_shares delete",
  );

  return data.length;
}

/** The live tokens for a journey, so the screen can show whether one is out there. */
export async function listShares(
  supabase: Client,
  journeyId: string,
): Promise<{ token: string; expiresAt: string | null }[]> {
  const data = mustList(
    await supabase
      .from("journey_shares")
      .select("token, expires_at")
      .eq("journey_id", journeyId)
      .order("created_at", { ascending: false }),
    "journey_shares",
  );

  return data
    .filter((row) => !row.expires_at || Date.parse(row.expires_at) > Date.now())
    .map((row) => ({ token: row.token, expiresAt: row.expires_at }));
}

/**
 * Read a shared journey by token.
 *
 * Returns null for a token that is unknown, expired or revoked — all three are the same
 * answer on purpose. Telling a caller which one it was confirms that a journey existed.
 */
export async function readShared(
  supabase: Client,
  token: string,
  locale: string,
): Promise<SharedSummary | null> {
  const data = mustMaybe(
    await supabase.rpc("share_summary", { p_token: token, p_locale: locale }),
    "share_summary",
  );

  if (!data) return null;
  return parseSummary(data);
}

/**
 * The owner's own view of the summary — the same projection, reached by ownership.
 *
 * Deliberately NOT assembled from `getJourney` here in TypeScript. Two assemblies of the
 * "same" page drift, and the direction this one would drift in is the owner previewing
 * something narrower than what they then send to their family.
 */
export async function readOwnSummary(
  supabase: Client,
  journeyId: string,
  locale: string,
): Promise<SharedSummary | null> {
  const data = mustMaybe(
    await supabase.rpc("my_journey_summary", { p_journey_id: journeyId, p_locale: locale }),
    "my_journey_summary",
  );

  if (!data) return null;
  return parseSummary(data);
}

/** A payload that does not match the projection is treated as no payload at all. */
function parseSummary(data: unknown): SharedSummary | null {
  const parsed = summarySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
