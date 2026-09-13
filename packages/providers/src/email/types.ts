/**
 * EmailProvider (TRD §2.1, INTEGRATIONS, ACCT-01).
 *
 * Transactional mail the application sends itself — a report's resolution, an account's
 * deletion date. Magic-link sign-in mail is sent by Supabase Auth over SMTP and never passes
 * through here.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** A category for the provider's dashboard. Never personal data. */
  tag?: string;
};

export type EmailResult =
  | { ok: true; id: string }
  /**
   * - `not_configured` — no key or sender yet (the state until ACCT-01 lands).
   * - `rejected` — the provider will never accept this message as sent (bad address,
   *   unverified domain); retrying only repeats the refusal.
   * - `unavailable` — timeout, network or upstream trouble; a later retry may succeed.
   */
  | { ok: false; reason: "not_configured" | "rejected" | "unavailable" };

export type EmailProvider = {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
};
