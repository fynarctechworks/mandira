import { z } from "zod";
import type { EmailMessage, EmailProvider, EmailResult } from "./types";

const RESEND_URL = "https://api.resend.com/emails";

const accepted = z.object({ id: z.string().min(1) });

/** Resend's tag values allow only ASCII letters, digits, underscores and dashes. */
const TAG_VALUE = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Resend adapter over its REST API — no SDK, so the dependency surface stays one `fetch`.
 *
 * Never throws: the caller decides whether a failed send matters, and the result says which
 * kind of failure it was, because a rejected address and a network blip call for opposite
 * responses.
 */
export function createResendProvider(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): EmailProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  return {
    name: "Resend",

    async send(message: EmailMessage): Promise<EmailResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await doFetch(RESEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            ...(message.tag && TAG_VALUE.test(message.tag)
              ? { tags: [{ name: "category", value: message.tag }] }
              : {}),
          }),
          signal: controller.signal,
        });

        if (response.status === 429 || response.status >= 500) {
          return { ok: false, reason: "unavailable" };
        }
        if (!response.ok) return { ok: false, reason: "rejected" };

        const parsed = accepted.safeParse(await response.json());
        return parsed.success
          ? { ok: true, id: parsed.data.id }
          : { ok: false, reason: "unavailable" };
      } catch {
        return { ok: false, reason: "unavailable" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
