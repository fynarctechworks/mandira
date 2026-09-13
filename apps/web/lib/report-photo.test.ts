import { describe, expect, it } from "vitest";

import {
  REPORT_PHOTO_BASE64_MAX,
  REPORT_PHOTO_MAX_BYTES,
  base64ToBytes,
  bytesToBase64,
  fitWithin,
  reportPhotoPath,
  sanitizeReportPhoto,
} from "./report-photo";

/** A segment: marker, big-endian length (which counts itself), payload. */
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Frame header: precision, height, width, one component. */
const sof0 = (width: number, height: number) =>
  segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);

function jpeg(parts: number[][]): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    ...parts.flat(),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    // Scan data, then end of image.
    0x12,
    0x34,
    0x56,
    0xff,
    0xd9,
  ]);
}

const includes = (haystack: Uint8Array, needle: number[]) =>
  Buffer.from(haystack).includes(Buffer.from(needle));

describe("sanitizeReportPhoto", () => {
  const exif = segment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 17.3850N 78.4867E")]);
  const xmp = segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/ GPSLatitude"));
  const comment = segment(0xfe, ascii("taken at home"));
  const jfif = segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const quantisation = segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);

  it("keeps what a decoder needs and reads the dimensions", () => {
    const photo = sanitizeReportPhoto(jpeg([jfif, quantisation, sof0(1200, 900)]));

    expect(photo).not.toBeNull();
    expect(photo!.width).toBe(1200);
    expect(photo!.height).toBe(900);
    expect(includes(photo!.bytes, ascii("JFIF"))).toBe(true);
    expect(includes(photo!.bytes, [0x12, 0x34, 0x56, 0xff, 0xd9])).toBe(true);
  });

  it("drops EXIF, XMP and comments — where a camera writes the location", () => {
    const photo = sanitizeReportPhoto(jpeg([jfif, exif, xmp, comment, sof0(800, 600)]));

    expect(photo).not.toBeNull();
    expect(includes(photo!.bytes, ascii("GPS"))).toBe(false);
    expect(includes(photo!.bytes, ascii("Exif"))).toBe(false);
    expect(includes(photo!.bytes, ascii("taken at home"))).toBe(false);
    expect(photo!.bytes[0]).toBe(0xff);
    expect(photo!.bytes[1]).toBe(0xd8);
  });

  it("refuses anything that is not a JPEG, whatever it claims to be", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xd9]);
    expect(sanitizeReportPhoto(png)).toBeNull();
    expect(sanitizeReportPhoto(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("refuses a JPEG with no frame header, or a truncated one", () => {
    expect(sanitizeReportPhoto(jpeg([jfif]))).toBeNull();

    const whole = jpeg([jfif, sof0(800, 600)]);
    expect(sanitizeReportPhoto(whole.subarray(0, whole.length - 2))).toBeNull();
  });

  it("refuses a segment whose length runs past the end of the file", () => {
    const lying = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00, 0xff, 0xd9]);
    expect(sanitizeReportPhoto(lying)).toBeNull();
  });

  it("refuses an image larger than the device would have produced", () => {
    expect(sanitizeReportPhoto(jpeg([sof0(1601, 900)]))).toBeNull();
    expect(sanitizeReportPhoto(jpeg([sof0(1600, 1200)]))).not.toBeNull();
  });

  it("refuses more bytes than the ceiling", () => {
    const padding = segment(
      0xe2,
      Array.from({ length: 60_000 }, () => 0),
    );
    const huge = jpeg([...Array.from({ length: 26 }, () => padding), sof0(800, 600)]);

    expect(huge.length).toBeGreaterThan(REPORT_PHOTO_MAX_BYTES);
    expect(sanitizeReportPhoto(huge)).toBeNull();
  });
});

describe("fitWithin", () => {
  it("caps the longest side and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe("base64", () => {
  it("round-trips bytes larger than one chunk", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("returns null for something that is not base64", () => {
    expect(base64ToBytes("not base64!")).toBeNull();
  });

  it("allows exactly enough characters for the byte ceiling", () => {
    expect(REPORT_PHOTO_BASE64_MAX).toBe(2_000_000);
  });
});

describe("reportPhotoPath", () => {
  it("files by month under a random name, with nothing about the reporter", () => {
    expect(
      reportPhotoPath(new Date("2026-09-13T10:00:00Z"), "0b5c8a4e-1111-4000-8000-000000000001"),
    ).toBe("2026/09/0b5c8a4e-1111-4000-8000-000000000001.jpg");
  });
});
