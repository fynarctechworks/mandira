import { describe, expect, it, vi } from "vitest";

import { createResendProvider, getEmailProvider } from "./index";

const message = {
  to: "pilgrim@example.invalid",
  subject: "Your report was reviewed",
  text: "Thank you — the timing has been corrected.",
  tag: "report_resolved",
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("createResendProvider", () => {
  it("sends with the key, the sender and the message, and returns the provider's id", async () => {
    const fetchImpl = reply(200, { id: "email_123" });
    const provider = createResendProvider({
      apiKey: "re_test",
      from: "Mandhira <hello@example.invalid>",
      fetchImpl,
    });

    await expect(provider.send(message)).resolves.toEqual({ ok: true, id: "email_123" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Mandhira <hello@example.invalid>",
      to: ["pilgrim@example.invalid"],
      subject: message.subject,
      text: message.text,
      tags: [{ name: "category", value: "report_resolved" }],
    });
  });

  it("calls a refused message rejected, so nobody retries a bad address", async () => {
    const provider = createResendProvider({ apiKey: "k", from: "f", fetchImpl: reply(422, {}) });
    await expect(provider.send(message)).resolves.toEqual({ ok: false, reason: "rejected" });
  });

  it("calls upstream trouble and throttling unavailable, which a retry may fix", async () => {
    for (const status of [429, 503]) {
      const provider = createResendProvider({
        apiKey: "k",
        from: "f",
        fetchImpl: reply(status, {}),
      });
      await expect(provider.send(message)).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });

  it("never throws on a network failure or an unexpected body", async () => {
    const offline = createResendProvider({
      apiKey: "k",
      from: "f",
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    await expect(offline.send(message)).resolves.toEqual({ ok: false, reason: "unavailable" });

    const odd = createResendProvider({
      apiKey: "k",
      from: "f",
      fetchImpl: reply(200, { nope: 1 }),
    });
    await expect(odd.send(message)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("drops a tag the provider would refuse rather than losing the whole message", async () => {
    const fetchImpl = reply(200, { id: "email_9" });
    const provider = createResendProvider({ apiKey: "k", from: "f", fetchImpl });

    await provider.send({ ...message, tag: "has spaces & symbols" });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("tags");
  });
});

describe("getEmailProvider", () => {
  it("answers not_configured without a key or sender, instead of throwing", async () => {
    await expect(getEmailProvider({}).send(message)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(getEmailProvider({ RESEND_API_KEY: "k" }).name).toBe("none");
  });

  it("uses Resend once both are present", () => {
    expect(getEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "f" }).name).toBe("Resend");
  });
});
