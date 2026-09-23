import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers.mjs";

const policy = (options: Parameters<typeof securityHeaders>[0]) =>
  securityHeaders(options).find((header) => header.key === "Permissions-Policy")?.value ?? "";

/**
 * The microphone is the one device permission either app may ask for, and only the
 * traveler app, only for its own pages (D-227, PRD §5 A07). Pinned because this header is
 * exactly the kind of thing a later change widens without anybody deciding to.
 */
describe("Permissions-Policy", () => {
  it("denies the microphone by default — Ops never asks for it", () => {
    expect(policy({})).toContain("microphone=()");
  });

  it("allows it to the traveler app's own pages when asked, and to no embedded frame", () => {
    const value = policy({ microphone: "self" });
    expect(value).toContain("microphone=(self)");
    expect(value).not.toContain("microphone=*");
  });

  it("keeps camera, location and payment denied whatever the microphone setting", () => {
    for (const value of [policy({}), policy({ microphone: "self" })]) {
      expect(value).toContain("camera=()");
      expect(value).toContain("geolocation=()");
      expect(value).toContain("payment=()");
    }
  });
});
