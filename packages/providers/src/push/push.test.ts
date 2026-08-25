import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails,
    sendNotification,
    generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
  },
}));

const { createWebPushProvider } = await import("./web-push");
const { shouldDisable, MAX_PUSH_FAILURES } = await import("./types");

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:support@mandhira.in" };

const subscription = {
  id: "s1",
  endpoint: "https://push.example/abc",
  keys: { p256dh: "p", auth: "a" },
};

const message = { title: "Time to leave", body: "About 15 minutes." };

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
});

describe("createWebPushProvider", () => {
  it("refuses to exist without VAPID credentials", () => {
    // Failing here beats failing at 3am inside a scheduled sender.
    expect(() => createWebPushProvider({ publicKey: "", privateKey: "", subject: "" })).toThrow(
      /VAPID/,
    );
  });

  it("identifies the sender to the push service once, at construction", () => {
    createWebPushProvider(vapid);

    expect(setVapidDetails).toHaveBeenCalledWith(vapid.subject, "pub", "priv");
  });

  it("reports a delivered message", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(result).toEqual({ status: "sent", subscriptionId: "s1" });
  });

  it("gives the message a TTL, because a late journey reminder is worse than none", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });

    await createWebPushProvider(vapid).send(subscription, message);

    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(message),
      expect.objectContaining({ TTL: 3600 }),
    );
  });

  it.each([404, 410])("treats %i as the subscription being gone, not a failure", async (code) => {
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: code }));

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(result.status).toBe("gone");
  });

  it.each([429, 500, 503])("treats %i as worth trying again", async (code) => {
    sendNotification.mockRejectedValue(Object.assign(new Error("busy"), { statusCode: code }));

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(result).toMatchObject({ status: "failed", retryable: true, code: String(code) });
  });

  it("does not retry a request that was wrong", async () => {
    // 400 means we sent something invalid; sending it again will be invalid in the same way.
    sendNotification.mockRejectedValue(Object.assign(new Error("bad"), { statusCode: 400 }));

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(result).toMatchObject({ status: "failed", retryable: false });
  });

  it("treats a network failure with no status as worth retrying", async () => {
    sendNotification.mockRejectedValue(new Error("socket hang up"));

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(result).toMatchObject({ status: "failed", retryable: true, code: "network" });
  });

  it("never puts the push service's own message on a result", async () => {
    sendNotification.mockRejectedValue(
      Object.assign(new Error("endpoint https://push.example/abc rejected"), { statusCode: 400 }),
    );

    const result = await createWebPushProvider(vapid).send(subscription, message);

    expect(JSON.stringify(result)).not.toContain("push.example");
  });
});

describe("shouldDisable", () => {
  it("drops a subscription the push service says is gone, immediately", () => {
    // Waiting for five failures to agree with an answer we already have just delays it.
    expect(shouldDisable({ status: "gone", subscriptionId: "s1" }, 0)).toBe(true);
  });

  it("keeps one that is merely failing, until it has failed enough", () => {
    const failure = {
      status: "failed" as const,
      subscriptionId: "s1",
      retryable: true,
      code: "500",
    };

    expect(shouldDisable(failure, MAX_PUSH_FAILURES - 2)).toBe(false);
    expect(shouldDisable(failure, MAX_PUSH_FAILURES - 1)).toBe(true);
  });

  it("never drops one that just worked", () => {
    expect(shouldDisable({ status: "sent", subscriptionId: "s1" }, 99)).toBe(false);
  });
});
