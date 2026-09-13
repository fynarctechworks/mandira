import { describe, expect, it, vi } from "vitest";

import {
  createSentryTracker,
  framesOf,
  getErrorTracker,
  maskPersonalData,
  parseDsn,
} from "./sentry";

const DSN = "https://abc123@o42.ingest.sentry.io/4507";

describe("parseDsn", () => {
  it("reads the key, host and project", () => {
    expect(parseDsn(DSN)).toEqual({
      publicKey: "abc123",
      origin: "https://o42.ingest.sentry.io",
      pathPrefix: "",
      projectId: "4507",
    });
  });

  it("keeps a self-hosted path prefix", () => {
    expect(parseDsn("https://k@sentry.example.org/relay/12")?.pathPrefix).toBe("/relay");
  });

  it("refuses anything that is not a DSN", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://o42.ingest.sentry.io/4507")).toBeNull();
    expect(parseDsn("https://k@host/not-a-number")).toBeNull();
  });
});

describe("createSentryTracker", () => {
  it("posts one envelope with the error and its route, and nothing personal", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const tracker = createSentryTracker({ dsn: DSN, environment: "production", fetchImpl });

    await tracker.capture({
      route: "POST /api/journeys",
      app: "web",
      error: new TypeError("no row for traveler@example.com"),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/o42\.ingest\.sentry\.io\/api\/4507\/envelope\/\?sentry_key=abc123/,
    );

    const [header, item, payload] = String(init.body).split("\n");
    expect(JSON.parse(header!)).toHaveProperty("event_id");
    expect(JSON.parse(item!)).toEqual({ type: "event" });

    const event = JSON.parse(payload!);
    expect(event.tags).toEqual({ app: "web", route: "POST /api/journeys" });
    expect(event.environment).toBe("production");
    expect(event.exception.values[0]).toMatchObject({
      type: "TypeError",
      value: "no row for [email]",
    });
    expect(String(init.body)).not.toContain("traveler@example.com");
  });

  it("will not start with an invalid DSN", () => {
    expect(() => createSentryTracker({ dsn: "nope" })).toThrow(/SENTRY_DSN/);
  });
});

describe("getErrorTracker", () => {
  it("is null without a usable DSN, so reporting stays on the console", () => {
    expect(getErrorTracker({})).toBeNull();
    expect(getErrorTracker({ SENTRY_DSN: "garbage" })).toBeNull();
    expect(getErrorTracker({ SENTRY_DSN: DSN })?.name).toBe("sentry");
  });
});

describe("helpers", () => {
  it("masks email addresses in messages", () => {
    expect(maskPersonalData("a.b+c@mail.example.in failed")).toBe("[email] failed");
  });

  it("turns a V8 stack into frames, oldest first", () => {
    const frames = framesOf(
      [
        "Error: x",
        "    at inner (/app/lib/a.ts:10:5)",
        "    at outer (/app/node_modules/pkg/b.js:2:1)",
      ].join("\n"),
    );
    expect(frames.map((f) => f.function)).toEqual(["outer", "inner"]);
    expect(frames[1]).toMatchObject({ filename: "/app/lib/a.ts", lineno: 10, in_app: true });
    expect(frames[0]?.in_app).toBe(false);
  });
});
