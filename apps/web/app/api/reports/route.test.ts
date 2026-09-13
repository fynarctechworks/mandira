import { beforeEach, describe, expect, it, vi } from "vitest";

import { bytesToBase64 } from "../../../lib/report-photo";
import { fakeSupabase, SIGNED_IN } from "../../../test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as unknown,
  store: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({ webSupabase: async () => state.client }));
vi.mock("@mandhira/db/client/server", async () => {
  const { openRateLimiter } = await import("../../../test/fake-supabase");
  return { createServiceRoleSupabase: openRateLimiter };
});
vi.mock("@mandhira/db/client/roles", () => ({ getOpsRoles: async () => [] }));
vi.mock("../../../lib/report", () => ({ reportServerError: state.reportError }));
vi.mock("../../../lib/report-photo-store", () => ({ storeReportPhoto: state.store }));

const { POST } = await import("./route");

const REPORT_ID = "0b5c8a4e-2222-4000-8000-000000000001";
const PLACE_ID = "d0000000-0000-4000-8000-00000000f002";

const base = { reportType: "closed", entityTable: "places", entityId: PLACE_ID, locale: "en" };

const post = (body: unknown) =>
  POST(
    new Request("https://mandhira.test/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** A structurally valid JPEG carrying a GPS position in EXIF. */
function photoWithLocation(width = 1200, height = 900): Uint8Array {
  const seg = (marker: number, payload: number[]) => {
    const length = payload.length + 2;
    return [0xff, marker, length >> 8, length & 0xff, ...payload];
  };
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  return new Uint8Array([
    0xff,
    0xd8,
    ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 17.3850N")]),
    ...seg(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0xff,
    0xd9,
  ]);
}

let fake: ReturnType<typeof fakeSupabase>;

function signedIn() {
  fake = fakeSupabase({
    user: SIGNED_IN,
    tables: { user_reports: { data: { id: REPORT_ID }, error: null } },
  });
  state.client = fake.client;
}

beforeEach(() => {
  state.store.mockReset();
  state.reportError.mockReset();
  fake = fakeSupabase({ user: null });
  state.client = fake.client;
});

describe("POST /api/reports", () => {
  it("asks a guest to sign in, mirroring the table's policy (OPEN-013)", async () => {
    const response = await post({ ...base, photo: bytesToBase64(photoWithLocation()) });

    expect(response.status).toBe(401);
    expect(fake.calls).toEqual([]);
    expect(state.store).not.toHaveBeenCalled();
  });

  it("files a report without a photo exactly as before", async () => {
    signedIn();

    const response = await post(base);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ received: true, photoAttached: false });
    expect(state.store).not.toHaveBeenCalled();

    const insert = fake.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).not.toHaveProperty("media_id");
  });

  it("stores the photo with its location removed, against the new report", async () => {
    signedIn();
    state.store.mockResolvedValue({ ok: true, mediaId: "m1" });

    const response = await post({ ...base, photo: bytesToBase64(photoWithLocation()) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ received: true, photoAttached: true });

    expect(state.store).toHaveBeenCalledTimes(1);
    const [, reportId, photo] = state.store.mock.calls[0]!;
    expect(reportId).toBe(REPORT_ID);
    expect(photo).toMatchObject({ width: 1200, height: 900 });
    expect(Buffer.from(photo.bytes).includes(Buffer.from("GPS"))).toBe(false);

    // The client never names the object's path, bucket or type, so nothing of the kind
    // reaches the report row either.
    const insert = fake.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).not.toHaveProperty("media_id");
  });

  it("refuses a photo that is not a JPEG before filing anything", async () => {
    signedIn();
    const svg = bytesToBase64(new TextEncoder().encode("<svg onload=alert(1)></svg>"));

    const response = await post({ ...base, photo: svg });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.fieldErrors).toHaveProperty("photo");
    expect(fake.calls.find((call) => call.method === "insert")).toBeUndefined();
    expect(state.store).not.toHaveBeenCalled();
  });

  it("refuses a photo larger than the device would have sent", async () => {
    signedIn();

    const response = await post({ ...base, photo: bytesToBase64(photoWithLocation(2400, 1800)) });

    expect(response.status).toBe(400);
    expect(state.store).not.toHaveBeenCalled();
  });

  it("refuses a field that is not base64, and extra fields naming a path or type are ignored", async () => {
    signedIn();

    expect((await post({ ...base, photo: "../../etc/passwd" })).status).toBe(400);

    state.store.mockResolvedValue({ ok: true, mediaId: "m1" });
    const response = await post({
      ...base,
      photo: bytesToBase64(photoWithLocation()),
      photoPath: "someone-else/their.jpg",
      contentType: "text/html",
    });
    expect(response.status).toBe(200);
    expect(state.store.mock.calls[0]).toHaveLength(3);
  });

  it("keeps the report when the photo cannot be stored, and says so", async () => {
    signedIn();
    state.store.mockResolvedValue({ ok: false, stage: "upload", cause: new Error("bucket") });

    const response = await post({ ...base, photo: bytesToBase64(photoWithLocation()) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ received: true, photoAttached: false });
    expect(state.reportError).toHaveBeenCalledTimes(1);
  });
});
