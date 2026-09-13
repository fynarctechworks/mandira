import { describe, expect, it } from "vitest";

import { isAllowedPushEndpoint } from "./endpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGx1",
    "https://db5p.notify.windows.com/w/?token=AwYA",
  ])("accepts a real push service: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["loopback", "https://127.0.0.1/push"],
    ["loopback spelled as a number", "https://2130706433/push"],
    ["loopback spelled in hex", "https://0x7f.1/push"],
    ["a metadata address", "https://169.254.169.254/latest/meta-data"],
    ["a private range", "https://10.0.0.5/push"],
    ["an IPv6 literal", "https://[::1]/push"],
    ["localhost", "https://localhost/push"],
    ["a .localhost name", "https://api.localhost/push"],
    ["an internal name", "https://push.internal/push"],
    ["a single-label host", "https://intranet/push"],
    ["credentials in the URL", "https://user:pass@fcm.googleapis.com/fcm/send/abc"],
    ["not a URL", "fcm.googleapis.com"],
  ])("refuses %s", (_, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
