import { describe, expect, it, vi } from "vitest";

import { assertEnv, checkEnv } from "./env-rules.mjs";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

const production = {
  ...base,
  CRON_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "https://app.mandhira.in",
  RESEND_API_KEY: "re_key",
  EMAIL_FROM: "Mandhira <hello@mandhira.in>",
};

const names = (findings: { level: string; name: string }[], level: "block" | "warn") =>
  findings.filter((finding) => finding.level === level).map((finding) => finding.name);

describe("checkEnv", () => {
  it("passes a minimal development setup without blocking", () => {
    expect(names(checkEnv(base, { app: "all", production: false }), "block")).toEqual([]);
  });

  it("blocks a production deploy missing what fails quietly", () => {
    const blocked = names(checkEnv(base, { app: "web", production: true }), "block");
    expect(blocked).toEqual(
      expect.arrayContaining(["CRON_SECRET", "NEXT_PUBLIC_APP_URL", "RESEND_API_KEY"]),
    );
  });

  it("passes a configured production deploy, warning only about absent features", () => {
    const findings = checkEnv(production, { app: "all", production: true });
    expect(names(findings, "block")).toEqual([]);
    expect(names(findings, "warn")).toEqual(
      expect.arrayContaining([
        "SENTRY_DSN",
        "OPENROUTESERVICE_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
      ]),
    );
  });

  it("refuses localhost and plain http in production", () => {
    const blocked = names(
      checkEnv(
        {
          ...production,
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        },
        { app: "web", production: true },
      ),
      "block",
    );
    expect(blocked).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"]),
    );
  });

  it("blocks any secret exposed to the browser", () => {
    expect(
      names(
        checkEnv(
          { ...base, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "oops" },
          { app: "all", production: false },
        ),
        "block",
      ),
    ).toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("requires email settings as a pair", () => {
    expect(
      names(
        checkEnv({ ...base, RESEND_API_KEY: "re" }, { app: "web", production: false }),
        "block",
      ),
    ).toContain("EMAIL_FROM");
  });

  it("requires all four VAPID values, with matching public keys", () => {
    const partial = checkEnv({ ...base, VAPID_PUBLIC_KEY: "a" }, { app: "web", production: false });
    expect(names(partial, "block")[0]).toMatch(/VAPID_PRIVATE_KEY/);

    const mismatched = checkEnv(
      {
        ...base,
        VAPID_PUBLIC_KEY: "a",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "b",
        VAPID_PRIVATE_KEY: "p",
        VAPID_SUBJECT: "mailto:ops@mandhira.in",
      },
      { app: "web", production: false },
    );
    expect(names(mismatched, "block")).toEqual(["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);
  });

  it("checks AI provider names and the Sentry DSN shape", () => {
    const blocked = names(
      checkEnv(
        { ...base, AI_PROVIDER: "gpt", SENTRY_DSN: "not-a-dsn" },
        { app: "all", production: false },
      ),
      "block",
    );
    expect(blocked).toEqual(expect.arrayContaining(["AI_PROVIDER", "SENTRY_DSN"]));
    expect(
      names(
        checkEnv(
          { ...base, SENTRY_DSN: "https://k@o1.ingest.sentry.io/123" },
          { app: "all", production: false },
        ),
        "block",
      ),
    ).toEqual([]);
  });

  it("does not ask Ops for traveler-only settings", () => {
    const opsBlocked = names(
      checkEnv({ ...base, CRON_SECRET: "x".repeat(32) }, { app: "ops", production: true }),
      "block",
    );
    expect(opsBlocked).not.toContain("NEXT_PUBLIC_APP_URL");
    expect(opsBlocked).not.toContain("RESEND_API_KEY");
  });
});

describe("assertEnv", () => {
  it("throws in production on a blocking finding, and only logs elsewhere", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => assertEnv("web", base, true)).toThrow(/Refusing to start web/);
    expect(() => assertEnv("web", base, false)).not.toThrow();
  });
});
