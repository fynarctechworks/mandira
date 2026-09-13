import type { EmailProvider } from "@mandhira/providers";

import { render } from "./notifications";

/**
 * Sending one queued email notification (PRD F15, D-171).
 *
 * Email is consent, not a channel the product may choose for someone. A row is queued without
 * knowing whether the traveler agreed — an operator resolving a report must not learn that, or
 * the address — so the decision is made here, at send time, from the traveler's own switches:
 * the `email` opt-in (off unless they turned it on) AND the switch for that notification type.
 * Either missing cancels the row; nothing is sent "just this once".
 */

export type EmailRow = {
  id: string;
  user_id: string;
  notification_type: string;
  title_i18n: unknown;
  body_i18n: unknown;
  payload: unknown;
  journey_id: string | null;
  scheduled_for: string | null;
};

export type EmailOutcome = "sent" | "cancelled" | "failed" | "retry";

/** How long an email the provider could not take is retried before it is given up on. */
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function deliverEmail(
  row: EmailRow,
  deps: {
    provider: EmailProvider;
    /** The stored switches; null when there is no live account to write to. */
    prefsOf: (userId: string) => Promise<Record<string, boolean> | null>;
    addressOf: (userId: string) => Promise<string | null>;
    now?: Date;
  },
): Promise<EmailOutcome> {
  const prefs = await deps.prefsOf(row.user_id);
  if (!prefs || prefs["email"] !== true || prefs[row.notification_type] === false) {
    return "cancelled";
  }

  const to = await deps.addressOf(row.user_id);
  if (!to) return "cancelled";

  const params = ((row.payload ?? {}) as { params?: Record<string, string | number> }).params ?? {};

  const result = await deps.provider.send({
    to,
    subject: render(keyOf(row.title_i18n), params, "en"),
    text: render(keyOf(row.body_i18n), params, "en"),
    // A category for the provider's dashboard — the type, never anything about the person.
    tag: row.notification_type,
  });

  if (result.ok) return "sent";
  // Rejected or unconfigured will answer the same way next time; retrying only repeats it.
  if (result.reason !== "unavailable") return "failed";

  const due = row.scheduled_for ? Date.parse(row.scheduled_for) : Number.NaN;
  const now = (deps.now ?? new Date()).getTime();
  return Number.isFinite(due) && now - due < RETRY_WINDOW_MS ? "retry" : "failed";
}

function keyOf(value: unknown): string | undefined {
  return (value as { key?: string } | null)?.key;
}
