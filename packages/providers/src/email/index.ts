import { createResendProvider } from "./resend";
import type { EmailProvider } from "./types";

export type { EmailMessage, EmailProvider, EmailResult } from "./types";
export { createResendProvider } from "./resend";

const notConfigured: EmailProvider = {
  name: "none",
  send: async () => ({ ok: false, reason: "not_configured" }),
};

/**
 * The configured sender: Resend when both a key and a verified sender address are present.
 *
 * Without them every send answers `not_configured` rather than throwing, so a feature that
 * mails as a courtesy keeps working in development and before ACCT-01, and says plainly that
 * nothing was sent.
 */
export function getEmailProvider(
  env: Record<string, string | undefined> = process.env,
): EmailProvider {
  const apiKey = env["RESEND_API_KEY"];
  const from = env["EMAIL_FROM"];
  return apiKey && from ? createResendProvider({ apiKey, from }) : notConfigured;
}
