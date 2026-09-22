import type { Json } from "@mandhira/db/types";

import type { Signal, SignalType } from "./personalization";
import type { webSupabase } from "./supabase";

type Client = Awaited<ReturnType<typeof webSupabase>>;

/**
 * Recording what a traveler explicitly told us (PRD-ACCT-004).
 *
 * Every call site is an action the traveler took on purpose — a tier they set, an item they
 * kept when offered its removal, one they removed. There is deliberately no `viewed`, no
 * `dwelled`, no `searched`: PRD §5 F13 forbids inference from behaviour, and the surest way
 * to keep that promise is for the function that writes signals to have no way to express one.
 *
 * NEVER throws. A signal is a nicety; the action it accompanies is what the traveler asked
 * for. Losing the chance to rank a future list better is not a reason to fail a retier.
 */
/**
 * A traveler's own signals, newest first and bounded.
 *
 * RLS restricts the table to its owner (0008), so this returns one person's rows or none —
 * a guest gets an empty list and, with it, purely editorial ranking. That is the intended
 * behaviour, not a degraded one: a first journey must not be worse than a second.
 *
 * Bounded at 200 because the horizon in `personalization.ts` discards most of what is
 * older anyway, and an unbounded read here would grow with a traveler's history forever.
 */
export async function readSignals(supabase: Client): Promise<Signal[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data } = await supabase
    .from("personalization_signals")
    .select("signal_type, entity_table, entity_id, value, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []) as Signal[];
}

export async function recordSignal(
  supabase: Client,
  input: {
    userId: string;
    type: SignalType;
    entityTable?: "experiences" | "places" | undefined;
    entityId?: string | null | undefined;
    journeyId?: string | null | undefined;
    value?: Record<string, unknown> | null | undefined;
  },
): Promise<void> {
  // A signal about nothing cannot rank anything, so it is not worth a row.
  if (!input.entityId) return;

  await supabase
    .from("personalization_signals")
    .insert({
      user_id: input.userId,
      signal_type: input.type,
      entity_table: input.entityTable ?? null,
      entity_id: input.entityId,
      journey_id: input.journeyId ?? null,
      value: (input.value ?? null) as Json,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
