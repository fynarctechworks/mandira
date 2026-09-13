import type { Database, Json } from "@mandhira/db/types";
import { z } from "zod";

import { DataUnavailableError, mustList, mustMaybe, mustWrite } from "./data-error";
import type { webSupabase } from "./supabase";

/**
 * The traveler's own account (PRD F13, A23; PRD-PRIV-003/004).
 *
 * Every call takes the request-scoped client, so RLS confines it to the signed-in traveler.
 * Export and erasure go through `export_my_data` / `request_account_deletion` (0033), which
 * filter on `auth.uid()` themselves — the account asks about itself and nobody else.
 */
type Client = Awaited<ReturnType<typeof webSupabase>>;

type Mobility = Database["public"]["Enums"]["mobility_enum"];
type AgeBand = Database["public"]["Enums"]["age_band_enum"];

/** The purge job's grace period (0013), mirrored so a screen can say when without a round trip. */
export const ERASURE_GRACE_DAYS = 30;

export type Account = {
  email: string | null;
  displayName: string | null;
  locale: string;
  /** When the account will be erased, or null when no erasure is pending. */
  erasureScheduledFor: string | null;
};

export type Traveler = {
  id: string;
  label: string | null;
  mobility: Mobility;
  ageBand: AgeBand;
  isSelf: boolean;
};

export type TravelerInput = {
  label: string | null;
  mobility: Mobility;
  ageBand: AgeBand;
};

/** What a traveler is, as the planner reads it; shared by the create and edit routes. */
export const travelerSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  mobility: z.enum(["full", "limited_walking", "wheelchair", "needs_rest_frequently"]),
  ageBand: z.enum(["child", "adult", "senior"]),
});

const TRAVELER_COLUMNS = "id, label, mobility, age_band, is_self";

export async function getAccount(
  supabase: Client,
  user: { id: string; email?: string | null | undefined },
): Promise<Account> {
  const row = mustMaybe(
    await supabase
      .from("profiles")
      .select("display_name, locale, deleted_at")
      .eq("id", user.id)
      .maybeSingle(),
    "profiles",
  );

  return {
    email: user.email ?? null,
    displayName: row?.display_name ?? null,
    locale: row?.locale ?? "en",
    erasureScheduledFor: row?.deleted_at ? erasureDate(row.deleted_at) : null,
  };
}

export function erasureDate(requestedAt: string): string {
  return new Date(Date.parse(requestedAt) + ERASURE_GRACE_DAYS * 86_400_000).toISOString();
}

export async function updateProfile(
  supabase: Client,
  userId: string,
  patch: { displayName?: string | null | undefined; locale?: string | undefined },
): Promise<void> {
  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.locale !== undefined) update.locale = patch.locale;

  mustWrite(await supabase.from("profiles").update(update).eq("id", userId), "profiles update");
}

export async function listTravelers(supabase: Client): Promise<Traveler[]> {
  const rows = mustList(
    await supabase
      .from("traveler_profiles")
      .select(TRAVELER_COLUMNS)
      .is("deleted_at", null)
      .order("is_self", { ascending: false })
      .order("created_at"),
    "traveler_profiles",
  );

  return rows.map(toTraveler);
}

export async function createTraveler(
  supabase: Client,
  userId: string,
  input: TravelerInput,
): Promise<Traveler> {
  const row = mustMaybe(
    await supabase
      .from("traveler_profiles")
      .insert({
        owner_user_id: userId,
        label: input.label,
        mobility: input.mobility,
        age_band: input.ageBand,
      })
      .select(TRAVELER_COLUMNS)
      .maybeSingle(),
    "traveler_profiles insert",
  );

  if (!row) {
    throw new DataUnavailableError("traveler_profiles insert", { message: "no row returned" });
  }
  return toTraveler(row);
}

/** Null when there is no such traveler on this account. */
export async function updateTraveler(
  supabase: Client,
  id: string,
  input: Partial<TravelerInput>,
): Promise<Traveler | null> {
  const update: Database["public"]["Tables"]["traveler_profiles"]["Update"] = {};
  if (input.label !== undefined) update.label = input.label;
  if (input.mobility !== undefined) update.mobility = input.mobility;
  if (input.ageBand !== undefined) update.age_band = input.ageBand;

  const row = mustMaybe(
    await supabase
      .from("traveler_profiles")
      .update(update)
      .eq("id", id)
      .is("deleted_at", null)
      .select(TRAVELER_COLUMNS)
      .maybeSingle(),
    "traveler_profiles update",
  );

  return row ? toTraveler(row) : null;
}

/**
 * Soft removal. The traveler's own profile stays: every journey is planned around its owner,
 * and removing them would leave the planner guessing who is travelling.
 */
export async function removeTraveler(
  supabase: Client,
  id: string,
): Promise<"removed" | "not_found" | "is_self"> {
  const row = mustMaybe(
    await supabase
      .from("traveler_profiles")
      .select("id, is_self")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    "traveler_profiles",
  );

  if (!row) return "not_found";
  if (row.is_self) return "is_self";

  mustWrite(
    await supabase
      .from("traveler_profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id),
    "traveler_profiles update",
  );

  return "removed";
}

export async function exportMyData(supabase: Client): Promise<Json | null> {
  const { data, error } = await supabase.rpc("export_my_data");
  mustWrite({ error }, "export_my_data");
  return data ?? null;
}

/** When the account will be erased. */
export async function requestErasure(supabase: Client): Promise<string> {
  const { data, error } = await supabase.rpc("request_account_deletion");
  mustWrite({ error }, "request_account_deletion");
  if (!data) {
    throw new DataUnavailableError("request_account_deletion", { message: "no date returned" });
  }
  return new Date(data).toISOString();
}

export async function cancelErasure(supabase: Client): Promise<void> {
  const { error } = await supabase.rpc("cancel_account_deletion");
  mustWrite({ error }, "cancel_account_deletion");
}

function toTraveler(row: {
  id: string;
  label: string | null;
  mobility: Mobility;
  age_band: AgeBand;
  is_self: boolean;
}): Traveler {
  return {
    id: row.id,
    label: row.label,
    mobility: row.mobility,
    ageBand: row.age_band,
    isSelf: row.is_self,
  };
}
