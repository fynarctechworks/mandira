import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  overdue: [] as { queue: string; open_count: number; oldest_at: string }[],
  usage: [] as {
    provider: string;
    period: string;
    label: string;
    quota: number;
    used: number;
    share: number;
    near_limit: boolean;
  }[],
  recipients: [] as { email: string | null }[],
  provider: "Resend",
  sent: [] as { to: string; subject: string; text: string }[],
  recorded: [] as [string, number][],
}));

vi.mock("@mandhira/db/client/server", () => ({
  createServiceRoleSupabase: () => ({
    rpc: async (name: string) => {
      if (name === "ops_overdue_queues") return { data: state.overdue, error: null };
      if (name === "provider_usage_status") return { data: state.usage, error: null };
      return { data: state.recipients, error: null };
    },
  }),
}));
vi.mock("@mandhira/providers", () => ({
  getEmailProvider: () => ({
    name: state.provider,
    send: async (message: { to: string; subject: string; text: string }) => {
      state.sent.push(message);
      return { ok: true };
    },
  }),
}));
vi.mock("../../../../lib/provider-usage", () => ({
  recordProviderUsage: async (provider: string, calls: number) => {
    state.recorded.push([provider, calls]);
  },
}));
vi.mock("../../../../lib/report", () => ({ reportServerError: vi.fn() }));

const { GET } = await import("./route");

const SECRET = "s".repeat(32);
const call = (authorization?: string) =>
  GET(
    new Request("https://mandhira.test/api/cron/ops-alerts", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  state.overdue = [];
  state.usage = [];
  state.recipients = [{ email: "admin@mandhira.test" }, { email: null }];
  state.provider = "Resend";
  state.sent = [];
  state.recorded = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/ops-alerts", () => {
  it("is closed without a secret, and refuses a wrong one", async () => {
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(`Bearer ${SECRET}`)).status).toBe(404);
  });

  it("sends nothing when no queue is overdue and every quota is below 70%", async () => {
    state.usage = [
      {
        provider: "resend",
        period: "day",
        label: "Resend email",
        quota: 100,
        used: 40,
        share: 40,
        near_limit: false,
      },
    ];

    const response = await call(`Bearer ${SECRET}`);

    expect(await response.json()).toEqual({ ok: true, overdue: 0, quotas: 0, sent: 0 });
    expect(state.sent).toEqual([]);
  });

  it("emails each admin one summary naming the queues and how long they waited", async () => {
    state.overdue = [
      {
        queue: "reports",
        open_count: 3,
        oldest_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      },
      {
        queue: "verify",
        open_count: 1,
        oldest_at: new Date(Date.now() - 12 * 86_400_000).toISOString(),
      },
    ];

    const body = await (await call(`Bearer ${SECRET}`)).json();

    expect(body).toEqual({ ok: true, overdue: 2, quotas: 0, sent: 1 });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]!.to).toBe("admin@mandhira.test");
    expect(state.sent[0]!.subject).toContain("2 queues");
    expect(state.sent[0]!.text).toContain("Reports: 3 waiting, the oldest for 9 days");
    expect(state.sent[0]!.text).toContain("Verify: 1 waiting, the oldest for 12 days");
  });

  it("names a provider at 70% of its free quota, and counts the alert's own email", async () => {
    state.usage = [
      {
        provider: "openrouteservice",
        period: "day",
        label: "OpenRouteService routing",
        quota: 2000,
        used: 1500,
        share: 75,
        near_limit: true,
      },
    ];

    const body = await (await call(`Bearer ${SECRET}`)).json();

    expect(body).toEqual({ ok: true, overdue: 0, quotas: 1, sent: 1 });
    expect(state.sent[0]!.subject).toContain("1 free quota is at 70% or more");
    expect(state.sent[0]!.text).toContain("OpenRouteService routing: 1500 of 2000 today (75%)");
    expect(state.recorded).toEqual([["resend", 1]]);
  });

  it("says so, rather than failing, when no email provider is configured", async () => {
    state.overdue = [{ queue: "conflicts", open_count: 1, oldest_at: "2026-01-01T00:00:00Z" }];
    state.provider = "none";

    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({
      ok: true,
      overdue: 1,
      quotas: 0,
      sent: 0,
      reason: "email_not_configured",
    });
    expect(state.recorded).toEqual([]);
  });
});
