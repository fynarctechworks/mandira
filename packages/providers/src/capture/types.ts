/**
 * CaptureProvider (PRD F17, TRD §4.3).
 *
 * A capture is EVIDENCE, not a document. It exists so that two runs a week apart can be
 * compared, and so an operator reviewing a change can see the words the machine saw. That
 * shapes everything below: the text is normalised for comparison rather than preserved for
 * reading, and every capture carries the hash it was compared by.
 *
 * Like every other provider here, a failure is an ANSWER rather than a throw — `ok: false`
 * with a reason. A run that cannot fetch must be recorded as a failed run: a job that
 * silently skips is indistinguishable from a source that has not changed, which is the
 * same mistake `unavailable` weather readings exist to avoid (D-132).
 */

export type CaptureFailure =
  /** The URL is not one this server will fetch — see `isFetchableUrl`. */
  | "refused"
  | "timeout"
  | "not_found"
  | "too_large"
  | "unreachable"
  /** Reached, but answered with something that is not text. */
  | "unsupported_type";

export type CaptureResult =
  | {
      ok: true;
      /** The URL actually fetched, after any same-origin redirects. */
      url: string;
      /** Normalised, comparable text — never the raw bytes. */
      text: string;
      /** Hex SHA-256 of `text`, so identical pages are cheap to recognise. */
      contentHash: string;
      /** When we fetched it. A source rarely tells us when it changed. */
      capturedAt: string;
      byteLength: number;
    }
  | { ok: false; reason: CaptureFailure; detail?: string };

export type CaptureProvider = {
  readonly name: string;
  fetchCapture(
    url: string,
    options?: { timeoutMs?: number; maxBytes?: number },
  ): Promise<CaptureResult>;
};
