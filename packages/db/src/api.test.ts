import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Database } from "../types";
import { ApiError, createWithApi, type OpsRole, type WithApiDeps } from "./api";

const user = { id: "u1", email: "traveler@test" } as User;

type Overrides = Partial<WithApiDeps> & {
  user?: User | null;
  roles?: OpsRole[];
  /** What the stubbed rate-limit RPC decides. */
  allowed?: boolean;
};

function deps(over: Overrides = {}) {
  const onUnexpected = vi.fn();

  const supabase = {
    auth: { getUser: async () => ({ data: { user: over.user ?? null } }) },
  } as unknown as SupabaseClient<Database>;

  // The rate limiter counts in SQL; here the RPC is stubbed so the wrapper's own decisions
  // — which scope, what happens on refusal — are what is under test.
  const rpc = vi.fn(async (_name: string, args: { p_window_seconds: number }) => ({
    data: [
      {
        allowed: over.allowed ?? true,
        remaining: 5,
        reset_at: new Date(Date.now() + args.p_window_seconds * 1000).toISOString(),
      },
    ],
    error: null,
  }));

  return {
    onUnexpected,
    rpc,
    value: {
      createClient: () => supabase,
      createServiceClient: () => ({ rpc }) as unknown as SupabaseClient<Database>,
      getRoles: async () => over.roles ?? [],
      onUnexpected,
      ...(over.anonKey ? { anonKey: over.anonKey } : {}),
    } satisfies WithApiDeps,
  };
}

const post = (body: unknown, headers?: Record<string, string>) =>
  new Request("https://mandhira.test/api/thing", {
    method: "POST",
    body: JSON.stringify(body),
    ...(headers ? { headers } : {}),
  });

const get = (query = "") => new Request(`https://mandhira.test/api/thing${query}`);

async function read(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("withApi", () => {
  it("validates, runs the handler and wraps the result", async () => {
    const withApi = createWithApi(deps().value);
    const route = withApi({
      schema: z.object({ name: z.string() }),
      handler: async ({ input }) => ({ greeting: `hello ${input.name}` }),
    });

    const { status, body } = await read(await route(post({ name: "Amma" })));

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, data: { greeting: "hello Amma" } });
  });

  it("names the fields that were wrong, so a form can show them inline", async () => {
    const withApi = createWithApi(deps().value);
    const route = withApi({
      schema: z.object({ days: z.number().int().min(1) }),
      handler: async () => ({}),
    });

    const { status, body } = await read(await route(post({ days: 0 })));

    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid");
    expect(body.error.fieldErrors).toHaveProperty("days");
  });

  it("reads a GET route's input from the query string", async () => {
    const withApi = createWithApi(deps().value);
    const route = withApi({
      schema: z.object({ slug: z.string() }),
      handler: async ({ input }) => input,
    });

    const { body } = await read(await route(get("?slug=tirumala")));

    expect(body.data).toEqual({ slug: "tirumala" });
  });

  it("refuses a body that is not JSON rather than crashing on it", async () => {
    const withApi = createWithApi(deps().value);
    const route = withApi({ schema: z.object({}), handler: async () => ({}) });

    const request = new Request("https://mandhira.test/api/thing", {
      method: "POST",
      body: "not json at all",
    });

    expect((await read(await route(request))).status).toBe(400);
  });

  describe("who may call it", () => {
    it("lets a guest through when no auth is required", async () => {
      const withApi = createWithApi(deps().value);
      const route = withApi({
        schema: z.object({}),
        handler: async ({ user: caller }) => ({ signedIn: caller !== null }),
      });

      const { status, body } = await read(await route(post({})));

      // The traveler app is guest-first (PRD-ACCT-001); requiring an account to look
      // around is how people leave.
      expect(status).toBe(200);
      expect(body.data).toEqual({ signedIn: false });
    });

    it("turns a guest away from a route that requires an account", async () => {
      const withApi = createWithApi(deps().value);
      const route = withApi({
        schema: z.object({}),
        requireAuth: true,
        handler: async () => ({}),
      });

      const { status, body } = await read(await route(post({})));

      expect(status).toBe(401);
      expect(body.error.message).not.toMatch(/error|failed/i);
    });

    it("treats naming roles as requiring an account", async () => {
      const withApi = createWithApi(deps().value);
      const route = withApi({
        schema: z.object({}),
        roles: ["editor"],
        handler: async () => ({}),
      });

      expect((await read(await route(post({})))).status).toBe(401);
    });

    it("refuses a signed-in user without the role", async () => {
      const withApi = createWithApi(deps({ user, roles: ["researcher"] }).value);
      const route = withApi({
        schema: z.object({}),
        roles: ["approver"],
        handler: async () => ({}),
      });

      const { status, body } = await read(await route(post({})));

      expect(status).toBe(403);
      // Someone who lacks access learns that they lack it, not the shape of the
      // permission model.
      expect(body.error.message).not.toMatch(/approver/i);
    });

    it("admits a user holding any one of the named roles", async () => {
      const withApi = createWithApi(deps({ user, roles: ["approver"] }).value);
      const route = withApi({
        schema: z.object({}),
        roles: ["editor", "approver"],
        handler: async () => ({ done: true }),
      });

      expect((await read(await route(post({})))).status).toBe(200);
    });
  });

  describe("rate limiting", () => {
    it("counts a signed-in caller against their own user id", async () => {
      const d = deps({ user });
      const withApi = createWithApi(d.value);
      const route = withApi({
        schema: z.object({}),
        requireAuth: true,
        rateLimit: "journeys_write",
        handler: async () => ({}),
      });

      await route(post({}));

      expect(d.rpc).toHaveBeenCalledWith(
        "consume_rate_limit",
        expect.objectContaining({ p_scope: "journeys_write", p_key: "u1" }),
      );
    });

    it("counts a guest against whatever the app can identify them by", async () => {
      const d = deps({ anonKey: () => "device:abc" });
      const withApi = createWithApi(d.value);
      const route = withApi({
        schema: z.object({}),
        rateLimit: "search",
        handler: async () => ({}),
      });

      await route(post({}));

      expect(d.rpc).toHaveBeenCalledWith(
        "consume_rate_limit",
        expect.objectContaining({ p_key: "device:abc" }),
      );
    });

    it("answers 429 with a Retry-After the caller can use", async () => {
      const withApi = createWithApi(deps({ user, allowed: false }).value);
      const route = withApi({
        schema: z.object({}),
        requireAuth: true,
        rateLimit: "intent_extract",
        handler: async () => ({}),
      });

      const response = await route(post({}));

      expect(response.status).toBe(429);
      // A 429 without Retry-After tells the caller to guess, and every client guesses
      // wrong in the same direction.
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await response.json()).error.message).toBe("Please try again in a few minutes.");
    });

    it("does not consume a limit on a route that declares none", async () => {
      const d = deps({ user });
      const withApi = createWithApi(d.value);
      const route = withApi({
        schema: z.object({}),
        requireAuth: true,
        handler: async () => ({}),
      });

      await route(post({}));

      expect(d.rpc).not.toHaveBeenCalled();
    });

    it("checks the limit before running the handler, not after", async () => {
      const handler = vi.fn(async () => ({}));
      const withApi = createWithApi(deps({ user, allowed: false }).value);
      const route = withApi({
        schema: z.object({}),
        requireAuth: true,
        rateLimit: "intent_extract",
        handler,
      });

      await route(post({}));

      // A limit enforced after the work is a limit on the reply, not on the cost.
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("when something goes wrong", () => {
    it("lets a handler refuse in its own words", async () => {
      const withApi = createWithApi(deps().value);
      const route = withApi({
        schema: z.object({}),
        handler: async () => {
          throw new ApiError("conflict", "That seva is fully booked for the day you chose.");
        },
      });

      const { status, body } = await read(await route(post({})));

      expect(status).toBe(409);
      expect(body.error.message).toBe("That seva is fully booked for the day you chose.");
    });

    it("turns a duplicate-key violation into a conflict rather than a 500", async () => {
      const withApi = createWithApi(deps().value);
      const route = withApi({
        schema: z.object({}),
        handler: async () => {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        },
      });

      expect((await read(await route(post({})))).status).toBe(409);
    });

    it("never puts a driver message on the wire", async () => {
      const d = deps();
      const withApi = createWithApi(d.value);
      const route = withApi({
        schema: z.object({}),
        handler: async () => {
          throw new Error('relation "traveler_profiles" does not exist at character 42');
        },
      });

      const { status, body } = await read(await route(post({})));

      expect(status).toBe(500);
      expect(JSON.stringify(body)).not.toContain("traveler_profiles");
      // The cause is reported where engineers can see it, not where callers can.
      expect(d.onUnexpected).toHaveBeenCalledOnce();
    });

    it("does not report a deliberate refusal as a bug", async () => {
      const d = deps();
      const withApi = createWithApi(d.value);
      const route = withApi({
        schema: z.object({}),
        handler: async () => {
          throw new ApiError("not_found");
        },
      });

      await route(post({}));

      expect(d.onUnexpected).not.toHaveBeenCalled();
    });
  });

  it("uses copy a traveler mid-journey can read (PRD §12.7)", async () => {
    const withApi = createWithApi(deps().value);

    const messages = await Promise.all(
      (["invalid", "forbidden", "not_found", "failed"] as const).map(async (code) => {
        const route = withApi({
          schema: z.object({}),
          handler: async () => {
            throw new ApiError(code);
          },
        });
        return (await (await route(post({}))).json()).error.message as string;
      }),
    );

    for (const message of messages) {
      expect(message).not.toMatch(/\berror\b|\bfailed\b|URGENT/i);
    }
  });

  it("never lets an API response be cached by a shared cache", async () => {
    const withApi = createWithApi(deps({ user }).value);
    const route = withApi({
      schema: z.object({}),
      requireAuth: true,
      handler: async () => ({ secret: "this traveler's journey" }),
    });

    // A shared cache is how one traveler ends up reading another's journey.
    expect((await route(post({}))).headers.get("cache-control")).toBe("no-store");
  });
});
