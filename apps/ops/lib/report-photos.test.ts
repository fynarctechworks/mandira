import type { createServiceRoleSupabase } from "@mandhira/db/client/server";
import { describe, expect, it, vi } from "vitest";

import {
  REPORT_PHOTO_URL_SECONDS,
  mayViewReportPhotos,
  pairSignedUrls,
  signReportPhotos,
} from "./report-photos";

describe("mayViewReportPhotos", () => {
  it("allows exactly the four roles PRD §10 names", () => {
    for (const role of ["support", "verifier", "editor", "admin"] as const) {
      expect(mayViewReportPhotos([role])).toBe(true);
    }
  });

  it("refuses every other Ops role, including media", () => {
    expect(mayViewReportPhotos(["media"])).toBe(false);
    expect(mayViewReportPhotos(["researcher", "translator", "reviewer", "approver"])).toBe(false);
    expect(mayViewReportPhotos([])).toBe(false);
  });
});

describe("pairSignedUrls", () => {
  it("matches by path and leaves out anything that did not sign", () => {
    const urls = pairSignedUrls(
      [
        { id: "m1", storage_path: "2026/09/a.jpg" },
        { id: "m2", storage_path: "2026/09/b.jpg" },
      ],
      [
        { path: "2026/09/b.jpg", signedUrl: "https://x/b?token=1", error: null },
        { path: "2026/09/a.jpg", signedUrl: null, error: "Object not found" },
      ],
    );

    expect([...urls]).toEqual([["m2", "https://x/b?token=1"]]);
  });
});

function fakeService(options: {
  assets: { data: { id: string; storage_path: string }[] | null; error: unknown };
  signed?: { data: unknown; error: unknown };
}) {
  const filters: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "is"]) {
    chain[method] = (...args: unknown[]) => {
      filters.push({ method, args });
      return chain;
    };
  }
  chain["then"] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(options.assets).then(resolve);

  const createSignedUrls = vi.fn(async () => options.signed ?? { data: [], error: null });
  const client = {
    from: vi.fn(() => chain),
    storage: { from: vi.fn(() => ({ createSignedUrls })) },
  } as unknown as ReturnType<typeof createServiceRoleSupabase>;

  return { client, filters, createSignedUrls };
}

describe("signReportPhotos", () => {
  it("signs nothing, and asks nothing, when no report has a photo", async () => {
    const fake = fakeService({ assets: { data: [], error: null } });

    expect(await signReportPhotos(fake.client, [])).toEqual(new Map());
    expect(fake.createSignedUrls).not.toHaveBeenCalled();
  });

  it("signs only reports-bucket assets, for fifteen minutes", async () => {
    const fake = fakeService({
      assets: { data: [{ id: "m1", storage_path: "2026/09/a.jpg" }], error: null },
      signed: {
        data: [{ path: "2026/09/a.jpg", signedUrl: "https://x/a?token=1", error: null }],
        error: null,
      },
    });

    const urls = await signReportPhotos(fake.client, ["m1", "m1"]);

    expect(urls?.get("m1")).toBe("https://x/a?token=1");
    expect(fake.filters).toContainEqual({ method: "eq", args: ["storage_bucket", "reports"] });
    expect(fake.filters).toContainEqual({ method: "in", args: ["id", ["m1"]] });
    expect(fake.createSignedUrls).toHaveBeenCalledWith(["2026/09/a.jpg"], REPORT_PHOTO_URL_SECONDS);
    expect(REPORT_PHOTO_URL_SECONDS).toBe(900);
  });

  it("reports that it could not sign, rather than returning no photos", async () => {
    const fake = fakeService({ assets: { data: null, error: { message: "down" } } });
    expect(await signReportPhotos(fake.client, ["m1"])).toBeNull();
  });
});
