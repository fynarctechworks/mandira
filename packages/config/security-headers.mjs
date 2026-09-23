/**
 * Security headers for both apps (TRD §6.1).
 *
 * Shared so the two apps cannot drift into different postures — Ops handles the knowledge
 * that travelers trust, and a weaker policy there is a weaker policy everywhere.
 *
 * `.mjs` because Next reads config before TypeScript is available to it.
 */

/**
 * Just the origin of a URL, or undefined if it is not one.
 *
 * A CSP is a public document served to every visitor, so only the ORIGIN of the Supabase
 * URL goes in it — never a path and never anything that arrived alongside it in an
 * environment variable.
 *
 * @param {string | undefined} url
 * @returns {string | undefined}
 */
function originOf(url) {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    // A malformed env var must not take the whole build down over a header.
    return undefined;
  }
}

/**
 * The Content-Security-Policy, written to what these apps actually load.
 *
 * A CSP that breaks the app is worse than no CSP, because the first person to hit a blocked
 * request will loosen it in a hurry and loosen it too far. So every allowance below names
 * what needs it, and the E2E suite is the check: 155 tests over every screen fail loudly if
 * a directive is too tight.
 *
 * @param {{ supabaseUrl?: string | undefined, isDev?: boolean | undefined }} options
 */
export function contentSecurityPolicy({ supabaseUrl, isDev = false } = {}) {
  // Only the origin, never the key: a CSP is a public document.
  const supabase = originOf(supabaseUrl) ?? "https://*.supabase.co";

  const directives = {
    "default-src": ["'self'"],

    /*
     * `'unsafe-inline'` is required and unavoidable here, not laziness. Next inlines its
     * bootstrap and streams RSC payloads through inline scripts; without it the app does
     * not boot at all.
     *
     * The honest fix is nonces, which Next supports only via middleware — and this app's
     * middleware already does locale routing plus a Supabase session refresh on every
     * request. Adding nonce generation there means every response becomes uncacheable.
     * Recorded as a deliberate M2 trade rather than pretended away (D-114).
     */
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],

    // Tailwind emits inline styles; next/font injects a style element.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],

    // `data:` covers inlined icons; MapTiler is listed for MAPS-02, which is not built yet
    // but will need it the day ACCT-03 arrives.
    "img-src": ["'self'", "data:", "blob:", supabase, "https://*.maptiler.com"],

    // Phrase audio (PRD F12, A17), streamed from the Supabase media bucket. Without this,
    // `default-src 'self'` silently refuses every recording.
    "media-src": ["'self'", supabase],

    "connect-src": [
      "'self'",
      supabase,
      // Supabase Realtime, for the Ops queues.
      supabase.replace("https://", "wss://"),
      "https://api.openrouteservice.org",
      "https://api.open-meteo.com",
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ],

    // The engine's Web Worker (D-060), and Serwist's service worker.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],

    // Nothing in either app embeds anything, or should be embedded.
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],

    // A journey is never posted anywhere but here.
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  // Upgrading is pointless on localhost and breaks the local Supabase over http.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}

/**
 * @param {{
 *   supabaseUrl?: string | undefined,
 *   isDev?: boolean | undefined,
 *   microphone?: "self" | "none" | undefined,
 * }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options = {}) {
  const { isDev = false, microphone = "none" } = options;

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },

    /*
     * Two years and preload-eligible. Only meaningful over https, so it is omitted in
     * development — a browser that sees it on localhost will refuse plain http to
     * localhost for the next two years, which is a genuinely unpleasant thing to debug.
     */
    ...(isDev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]),

    { key: "X-Content-Type-Options", value: "nosniff" },
    // Belt and braces with frame-ancestors, for anything that predates CSP support.
    { key: "X-Frame-Options", value: "DENY" },

    // A shared journey link must not leak its token in a Referer to whatever a traveler
    // taps next — that token IS the credential (TRD-SEC-004).
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

    /*
     * Camera, location and payment are denied outright in both apps — including the Live
     * screen, which hands navigation to the traveler's own maps app rather than tracking
     * them (D-106). Denying them means a future dependency cannot quietly start asking.
     *
     * The MICROPHONE is the one exception, and only where asked for (D-227). PRD §5 A07
     * puts a mic on the plan screen, so the traveler app passes `microphone: "self"`:
     * its own pages may ask, no embedded frame may, and the browser's own permission
     * prompt still stands between the page and the device. Ops never asks for it.
     */
    {
      key: "Permissions-Policy",
      value: `camera=(), microphone=(${microphone === "self" ? "self" : ""}), geolocation=(), interest-cohort=(), payment=()`,
    },
  ];
}
