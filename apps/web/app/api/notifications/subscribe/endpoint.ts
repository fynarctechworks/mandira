/**
 * Whether a Web Push endpoint is one the notifications cron may send to (NOTF-01).
 *
 * The endpoint is chosen by the browser, but it arrives here from the client, and the cron
 * later makes a server-side POST to it with our VAPID signature. Accepting any URL would let
 * a signed-in account point that request at our own network — `localhost`, a metadata
 * address, a private range. Real push services are public HTTPS hostnames
 * (fcm.googleapis.com, updates.push.services.mozilla.com, web.push.apple.com,
 * *.notify.windows.com), so everything else is refused:
 *
 *   - anything but `https:`;
 *   - IP-literal hosts of either family — which covers loopback, private, link-local and
 *     metadata ranges however they are spelled, since the URL parser normalises
 *     `0x7f.1` and `2130706433` to dotted IPv4;
 *   - `localhost` and `*.localhost`, and single-label or internal-only names;
 *   - credentials in the URL.
 */
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;

  // IPv6 literals keep their brackets in `hostname`; IPv4 is normalised to dotted form.
  if (host.startsWith("[") || host.includes(":")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;

  if (host === "localhost" || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return false;
  }

  // A single-label name only resolves on a private network.
  return host.includes(".");
}
