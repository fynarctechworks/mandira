import type { EmailProvider, EmailResult } from "@mandhira/providers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mandhira/db/client/server", () => ({ createServiceRoleSupabase: vi.fn() }));

const { deliverEmail } = await import("./email-delivery");

const NOW = new Date("2026-09-13T06:00:00Z");

const row = {
  id: "n1",
  user_id: "u1",
  notification_type: "report_resolved",
  title_i18n: { key: "notify.report_resolved.title" },
  body_i18n: { key: "notify.report_resolved.body" },
  payload: { outcome: "updated" },
  journey_id: null,
  scheduled_for: "2026-09-13T05:00:00Z",
};

function provider(result: EmailResult = { ok: true, id: "m1" }) {
  const send = vi.fn(async () => result);
  return { provider: { name: "fake", send } as EmailProvider, send };
}

const optedIn = async () => ({ email: true });
const address = async () => "traveler@example.com";

describe("deliverEmail", () => {
  it("sends to a traveler who opted in, with the notification's own copy", async () => {
    const { provider: fake, send } = provider();

    await expect(
      deliverEmail(row, { provider: fake, prefsOf: optedIn, addressOf: address, now: NOW }),
    ).resolves.toBe("sent");
    expect(send).toHaveBeenCalledWith({
      to: "traveler@example.com",
      subject: "Thanks — we checked that",
      text: "What you told us about has been looked at.",
      tag: "report_resolved",
    });
  });

  it("cancels without looking up an address when the traveler never opted in", async () => {
    const { provider: fake, send } = provider();
    const addressOf = vi.fn(address);

    await expect(
      deliverEmail(row, { provider: fake, prefsOf: async () => ({}), addressOf, now: NOW }),
    ).resolves.toBe("cancelled");
    expect(addressOf).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels when that type is switched off, even with email on", async () => {
    const { provider: fake, send } = provider();

    await expect(
      deliverEmail(row, {
        provider: fake,
        prefsOf: async () => ({ email: true, report_resolved: false }),
        addressOf: address,
        now: NOW,
      }),
    ).resolves.toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
  });

  it("cancels for an account that is gone or has no address", async () => {
    const { provider: fake } = provider();

    await expect(
      deliverEmail(row, { provider: fake, prefsOf: async () => null, addressOf: address }),
    ).resolves.toBe("cancelled");
    await expect(
      deliverEmail(row, { provider: fake, prefsOf: optedIn, addressOf: async () => null }),
    ).resolves.toBe("cancelled");
  });

  it("retries a recent send the provider could not take, and gives up on an old one", async () => {
    const { provider: fake } = provider({ ok: false, reason: "unavailable" });
    const deps = { provider: fake, prefsOf: optedIn, addressOf: address, now: NOW };

    await expect(deliverEmail(row, deps)).resolves.toBe("retry");
    await expect(
      deliverEmail({ ...row, scheduled_for: "2026-09-11T05:00:00Z" }, deps),
    ).resolves.toBe("failed");
  });

  it("does not retry a message the provider refused", async () => {
    const { provider: fake } = provider({ ok: false, reason: "rejected" });

    await expect(
      deliverEmail(row, { provider: fake, prefsOf: optedIn, addressOf: address, now: NOW }),
    ).resolves.toBe("failed");
  });
});
