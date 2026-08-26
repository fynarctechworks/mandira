import { createHash } from "node:crypto";

import { normaliseCapture } from "./normalise";
import type { CaptureProvider, CaptureResult } from "./types";

/**
 * The `url_monitor` capture provider (PRD F17, PRD-OPS-SRC-002).
 *
 * A server that fetches URLs an operator typed is a server-side request forgery waiting to
 * happen: `http://169.254.169.254/…` reaches a cloud metadata endpoint, `http://localhost:5432`
 * reaches the database, and a redirect can walk from a legitimate host to either. So the
 * guard below is not defensive habit — it is the security control for this feature, and it
 * runs again on every redirect rather than only on the URL the operator typed.
 *
 * Everything is bounded: a timeout, a byte cap, a redirect cap. A cron invocation has a
 * time budget and a monitored source is somebody else's server.
 */
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Identifies us honestly. A monitored source is entitled to know who is reading it. */
const USER_AGENT = "MandhiraIngest/1.0 (+https://mandhira.com/ops/sources)";

export function createHttpCaptureProvider(): CaptureProvider {
  return {
    name: "http",

    async fetchCapture(url, options): Promise<CaptureResult> {
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

      const refusal = refuse(url);
      if (refusal) return { ok: false, reason: "refused", detail: refusal };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let current = url;
        let response: Response | undefined;

        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          response = await fetch(current, {
            redirect: "manual",
            signal: controller.signal,
            headers: { "user-agent": USER_AGENT, accept: "text/html, text/plain, application/json" },
          });

          if (response.status < 300 || response.status >= 400) break;

          const location = response.headers.get("location");
          if (!location) break;

          // Re-checked, not trusted. A redirect is the obvious way past a one-time guard.
          const next = new URL(location, current).toString();
          const redirectRefusal = refuse(next);
          if (redirectRefusal) {
            return { ok: false, reason: "refused", detail: `redirect to ${redirectRefusal}` };
          }

          current = next;
          if (hop === MAX_REDIRECTS) {
            return { ok: false, reason: "unreachable", detail: "too many redirects" };
          }
        }

        if (!response) return { ok: false, reason: "unreachable" };
        if (response.status === 404 || response.status === 410) {
          return { ok: false, reason: "not_found", detail: `HTTP ${response.status}` };
        }
        if (!response.ok) {
          return { ok: false, reason: "unreachable", detail: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get("content-type") ?? "text/html";
        if (!/text\/|json|xml/i.test(contentType)) {
          return { ok: false, reason: "unsupported_type", detail: contentType };
        }

        // Checked before reading as well as after: a declared length lets us decline a
        // 500 MB body without pulling it down first.
        const declared = Number(response.headers.get("content-length") ?? "0");
        if (declared > maxBytes) {
          return { ok: false, reason: "too_large", detail: `${declared} bytes declared` };
        }

        const body = await response.text();
        const byteLength = Buffer.byteLength(body, "utf8");
        if (byteLength > maxBytes) {
          return { ok: false, reason: "too_large", detail: `${byteLength} bytes` };
        }

        const text = normaliseCapture(body, contentType);

        return {
          ok: true,
          url: current,
          text,
          contentHash: createHash("sha256").update(text).digest("hex"),
          capturedAt: new Date().toISOString(),
          byteLength,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { ok: false, reason: "timeout", detail: `${timeoutMs} ms` };
        }
        return { ok: false, reason: "unreachable", detail: reason(error) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Why this URL will not be fetched — or null if it will be.
 *
 * Exported so the SSRF rule can be tested directly rather than through a network call, and
 * so the sources editor can refuse a bad URL at the point somebody types it instead of at
 * 3am inside a cron run.
 */
export function refuse(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "not a URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `unsupported scheme ${parsed.protocol}`;
  }

  // Credentials in a monitored URL would end up in `source_captures.storage_path` and in
  // an operator's screen. Neither is a place for a password.
  if (parsed.username || parsed.password) return "URL carries credentials";

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateHost(host)) return `private address ${host}`;

  return null;
}

/**
 * Literal private, loopback and link-local addresses.
 *
 * This does NOT resolve DNS, so a hostname pointing at 127.0.0.1 still passes — closing
 * that needs resolution plus a pinned connection, which `fetch` does not expose. What it
 * does close is every direct form, which is what an accidental paste or a redirect looks
 * like. The residual risk is recorded in the plan rather than implied away.
 */
function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  // Unique-local and link-local IPv6.
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;

  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT

  return false;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
