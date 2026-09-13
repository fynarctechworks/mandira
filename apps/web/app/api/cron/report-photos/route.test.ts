import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  due: [] as { media_id: string; storage_path: string }[],
  dueError: null as unknown,
  removeError: null as unknown,
  calls: [] as string[],
  removed: [] as string[][],
  forgotten: [] as string[],
}));

vi.mock("@mandhira/db/client/server", () => ({
  createServiceRoleSupabase: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push(name);
      if (name === "report_photos_due") return { data: state.due, error: state.dueError };
      state.forgotten.push(String(args["p_media_id"]));
      return { data: true, error: null };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          state.calls.push("remove");
          state.removed.push(paths);
          return { data: [], error: state.removeError };
        },
      }),
    },
  }),
}));
vi.mock("../../../../lib/report", () => ({ reportServerError: vi.fn() }));

const { GET } = await import("./route");

const call = (authorization?: string) =>
  GET(
    new Request("https://mandhira.test/api/cron/report-photos", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s".repeat(32));
  state.due = [
    { media_id: "m1", storage_path: "2026/01/a.jpg" },
    { media_id: "m2", storage_path: "2026/01/b.jpg" },
  ];
  state.dueError = null;
  state.removeError = null;
  state.calls = [];
  state.removed = [];
  state.forgotten = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/report-photos", () => {
  it("is closed without a configured secret, and refuses a wrong one", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(`Bearer ${"s".repeat(32)}`)).status).toBe(404);

    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    expect((await call("Bearer nope")).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("removes the files first, then forgets their rows", async () => {
    const response = await call(`Bearer ${"s".repeat(32)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, removed: 2, forgotten: 2 });
    expect(state.removed).toEqual([["2026/01/a.jpg", "2026/01/b.jpg"]]);
    expect(state.calls).toEqual([
      "report_photos_due",
      "remove",
      "forget_report_photo",
      "forget_report_photo",
    ]);
  });

  it("forgets nothing when the files could not be removed", async () => {
    state.removeError = { message: "storage unavailable" };

    expect((await call(`Bearer ${"s".repeat(32)}`)).status).toBe(503);
    expect(state.forgotten).toEqual([]);
  });

  it("does nothing on a night with nothing due", async () => {
    state.due = [];

    expect(await (await call(`Bearer ${"s".repeat(32)}`)).json()).toMatchObject({
      removed: 0,
      forgotten: 0,
    });
    expect(state.calls).toEqual(["report_photos_due"]);
  });
});
