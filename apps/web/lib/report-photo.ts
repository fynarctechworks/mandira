/**
 * One optional photo on a traveler report (PRD F14, D-016, migration 0036).
 *
 * Two halves that must agree, so they live together:
 *
 *   * On the DEVICE, the picked file is decoded and redrawn through a canvas as a JPEG no
 *     larger than 1600 px on its longest side. Redrawing is what removes EXIF — including
 *     the GPS position most phone cameras embed — because a canvas carries pixels only.
 *     It also turns a 6 MB camera original into something a 4G connection can send.
 *
 *   * On the SERVER, nothing the device says is trusted. The bytes must parse as a JPEG,
 *     every metadata segment is dropped again (a modified client could skip the canvas),
 *     and the dimensions and size are re-checked. The content type and storage path are
 *     decided by the server, never read from the request.
 */

export const REPORT_PHOTO_MAX_EDGE = 1600;

/** Decoded size ceiling. The `reports` bucket refuses anything over 2 MB (0036). */
export const REPORT_PHOTO_MAX_BYTES = 1_500_000;

/** The longest base64 string that can decode to at most REPORT_PHOTO_MAX_BYTES. */
export const REPORT_PHOTO_BASE64_MAX = Math.ceil(REPORT_PHOTO_MAX_BYTES / 3) * 4;

export type ReportPhoto = { bytes: Uint8Array; width: number; height: number };

// ── Shared ────────────────────────────────────────────────────────────────────

/** Scales `width × height` down (never up) so the longest side is at most `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = REPORT_PHOTO_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: String.fromCharCode over a megabyte of arguments overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Null when the string is not base64 at all. */
export function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

/**
 * The photo as it will be stored, or null when it is not one we accept.
 *
 * Walks the JPEG's segments up to the start of the image data, keeping what a decoder
 * needs (quantisation and Huffman tables, frame header, restart interval, JFIF) and
 * dropping every APP1–APP15 segment and comment — which is where EXIF, GPS, XMP, maker
 * notes and embedded thumbnails live. The pixels are not decoded; they do not need to be.
 */
export function sanitizeReportPhoto(input: Uint8Array): ReportPhoto | null {
  if (input.length < 4 || input.length > REPORT_PHOTO_MAX_BYTES) return null;
  if (input[0] !== 0xff || input[1] !== 0xd8) return null;
  if (input[input.length - 2] !== 0xff || input[input.length - 1] !== 0xd9) return null;

  const kept: Uint8Array[] = [input.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let offset = 2;

  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) return null;

    const marker = input[offset + 1]!;
    if (marker === 0xff) {
      // Fill byte before a marker.
      offset += 1;
      continue;
    }
    // A standalone marker or end-of-image before any image data: not a photo.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      return null;
    }

    const length = (input[offset + 2]! << 8) | input[offset + 3]!;
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) return null;

    if (marker === 0xda) {
      // Start of scan: everything from here is image data.
      if (width === 0 || height === 0) return null;
      if (Math.max(width, height) > REPORT_PHOTO_MAX_EDGE) return null;

      kept.push(input.subarray(offset));
      return { bytes: concat(kept), width, height };
    }

    // SOF0–SOF15, excluding DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      if (length < 8) return null;
      height = (input[offset + 5]! << 8) | input[offset + 6]!;
      width = (input[offset + 7]! << 8) | input[offset + 8]!;
    }

    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) kept.push(input.subarray(offset, end));

    offset = end;
  }

  return null;
}

/**
 * Where a report photo is stored: `yyyy/mm/<random>.jpg`.
 *
 * Nothing about the reporter. The path is kept in `media_assets`, whose history Ops can
 * read, so a folder named after the user id would undo the pseudonymisation PRD §10
 * requires of the queue.
 */
export function reportPhotoPath(now: Date, id: string): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${month}/${id}.jpg`;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ── Device ────────────────────────────────────────────────────────────────────

export type PreparedReportPhoto = {
  blob: Blob;
  base64: string;
  width: number;
  height: number;
};

/**
 * Attempts, largest first. A detailed scene at 1600 px can exceed the size ceiling at the
 * first quality; stepping down beats refusing a photo the traveler has already taken.
 */
const ATTEMPTS = [
  { edge: REPORT_PHOTO_MAX_EDGE, quality: 0.82 },
  { edge: REPORT_PHOTO_MAX_EDGE, quality: 0.7 },
  { edge: 1280, quality: 0.7 },
  { edge: 1024, quality: 0.6 },
] as const;

/**
 * Re-encodes a picked image for sending. Null when it cannot be decoded or cannot be made
 * small enough — the caller says so and the report can still go without it.
 */
export async function prepareReportPhoto(file: File): Promise<PreparedReportPhoto | null> {
  if (!file.type.startsWith("image/")) return null;

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    // Browsers apply the EXIF orientation when decoding an <img>, so the redraw is upright
    // even though the orientation tag itself is not carried over.
    await image.decode();

    for (const attempt of ATTEMPTS) {
      const size = fitWithin(image.naturalWidth, image.naturalHeight, attempt.edge);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;

      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(image, 0, 0, size.width, size.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", attempt.quality),
      );
      if (!blob) return null;

      if (blob.size <= REPORT_PHOTO_MAX_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { blob, base64: bytesToBase64(bytes), ...size };
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
