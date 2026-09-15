import { describe, expect, it, vi } from "vitest";

vi.mock("@mandhira/db/client/server", () => ({
  createServiceRoleSupabase: () => {
    throw new Error("no service role in this test");
  },
}));

const { recordProviderUsage } = await import("./provider-usage");

describe("recordProviderUsage", () => {
  it("adds the calls to the provider's count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await recordProviderUsage("openrouteservice", 3.2, { rpc } as never);

    expect(rpc).toHaveBeenCalledWith("record_provider_usage", {
      p_provider: "openrouteservice",
      p_calls: 3,
    });
  });

  it("records nothing for no calls", async () => {
    const rpc = vi.fn();

    await recordProviderUsage("resend", 0, { rpc } as never);
    await recordProviderUsage("resend", Number.NaN, { rpc } as never);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("never lets a failed count reach the caller", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(recordProviderUsage("resend", 1, { rpc } as never)).resolves.toBeUndefined();
    await expect(recordProviderUsage("resend", 1)).resolves.toBeUndefined();
  });
});
