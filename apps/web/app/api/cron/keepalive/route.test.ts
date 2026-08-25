import { afterEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();

vi.mock("@mandhira/db/client/server", () => ({
  createServiceRoleSupabase: () => ({
    from: () => ({ select: () => ({ limit: select }) }),
  }),
}));

const { GET } = await import("./route");

const call = (headers?: Record<string, string>) =>
  GET(new Request("https://mandhira.test/api/cron/keepalive", { ...(headers ? { headers } : {}) }));

const originalSecret = process.env["CRON_SECRET"];

afterEach(() => {
  if (originalSecret === undefined) delete process.env["CRON_SECRET"];
  else process.env["CRON_SECRET"] = originalSecret;
  select.mockReset();
});

describe("keepalive", () => {
  it("keeps the project awake when Vercel Cron calls it", async () => {
    process.env["CRON_SECRET"] = "s3cret";
    select.mockResolvedValue({ data: [{ code: "en" }], error: null });

    const response = await call({ authorization: "Bearer s3cret" });

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(select).toHaveBeenCalledOnce();
  });

  it("turns away a caller without the secret, and touches nothing", async () => {
    process.env["CRON_SECRET"] = "s3cret";

    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    // An unauthenticated endpoint that touches the database is worth more to an attacker
    // than to us.
    expect(select).not.toHaveBeenCalled();
  });

  it("is closed, not open, when no secret is configured", async () => {
    delete process.env["CRON_SECRET"];

    expect((await call({ authorization: "Bearer anything" })).status).toBe(404);
    expect(select).not.toHaveBeenCalled();
  });

  it("reports a database that did not answer rather than claiming success", async () => {
    process.env["CRON_SECRET"] = "s3cret";
    select.mockResolvedValue({ data: null, error: { message: "connection refused" } });

    const response = await call({ authorization: "Bearer s3cret" });

    expect(response.status).toBe(503);
    expect((await response.json()).ok).toBe(false);
  });

  it("is never cached — a cached keepalive keeps nothing alive", async () => {
    process.env["CRON_SECRET"] = "s3cret";
    select.mockResolvedValue({ data: [], error: null });

    expect((await call({ authorization: "Bearer s3cret" })).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
});
