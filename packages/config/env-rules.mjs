/**
 * Every environment variable the apps read in production, and what its absence means.
 *
 * Shared by `scripts/preflight.mjs` (before a deploy) and each app's `instrumentation.ts` (when
 * the server starts), so the deploy gate and the running app can never disagree about what
 * "configured" means. Plain JavaScript because the preflight runs before anything is built.
 *
 * Two levels, and the difference is the whole point:
 *   block — something that would fail QUIETLY in production: a screen that loads and does the
 *           wrong thing. A deploy stops; a production server refuses to start.
 *   warn  — a feature that will be absent, not broken (no push, structured form instead of AI).
 */

/** @typedef {"web" | "ops"} App */
/** @typedef {{ level: "block" | "warn", name: string, message: string }} Finding */

const AI_PROVIDERS = ["google", "anthropic", "openai"];
const AI_KEYS = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ app: App | "all", production: boolean }} options
 * @returns {Finding[]}
 */
export function checkEnv(env, { app, production }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @param {string} name @param {string} message */
  const block = (name, message) => findings.push({ level: "block", name, message });
  /** @param {string} name @param {string} message */
  const warn = (name, message) => findings.push({ level: "warn", name, message });
  /** @param {string} name */
  const value = (name) => (env[name] ?? "").trim();
  /** @param {string} name */
  const has = (name) => value(name).length > 0;
  /** @param {App[]} apps */
  const forApp = (apps) => app === "all" || apps.includes(app);

  // ── Supabase: both apps, every environment ────────────────────────────────────────────
  if (!has("NEXT_PUBLIC_SUPABASE_URL")) {
    block("NEXT_PUBLIC_SUPABASE_URL", "Nothing can read or write without it.");
  } else if (production) {
    const url = value("NEXT_PUBLIC_SUPABASE_URL");
    if (/localhost|127\.0\.0\.1/.test(url)) {
      block(
        "NEXT_PUBLIC_SUPABASE_URL",
        "Points at localhost. It is baked into the client bundle, so every browser would look " +
          "for a database on the visitor's own machine: the app loads and nothing works.",
      );
    } else if (!url.startsWith("https://")) {
      block(
        "NEXT_PUBLIC_SUPABASE_URL",
        "Is not https. An anon key over http is an anon key in public.",
      );
    }
  }
  if (!has("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    block("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Every read is refused until this exists.");
  }
  if (!has("SUPABASE_SERVICE_ROLE_KEY")) {
    block(
      "SUPABASE_SERVICE_ROLE_KEY",
      "The rate limiter runs on it and fails CLOSED without it, so every limited route answers " +
        "429; scheduled jobs and privileged writes fail too.",
    );
  }

  // ── Nothing secret may reach the browser ──────────────────────────────────────────────
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SECRET|PRIVATE/.test(name)) {
      block(
        name,
        "Is exposed to the browser. NEXT_PUBLIC_ values are inlined into the client bundle; a " +
          "service-role key there bypasses RLS for anyone who opens devtools.",
      );
    }
  }

  // ── Scheduled jobs ────────────────────────────────────────────────────────────────────
  if (production) {
    if (!has("CRON_SECRET")) {
      block(
        "CRON_SECRET",
        "Cron routes answer 404 without it: notifications are never sent, feeds never refresh, " +
          "ingestion never runs, and the free-tier database pauses.",
      );
    } else if (value("CRON_SECRET").length < 24) {
      block(
        "CRON_SECRET",
        "Is too short for an endpoint that touches the database. Use 32+ random characters.",
      );
    }
  }

  // ── Traveler app ──────────────────────────────────────────────────────────────────────
  if (forApp(["web"])) {
    if (production) {
      const appUrl = value("NEXT_PUBLIC_APP_URL");
      if (!appUrl) {
        block(
          "NEXT_PUBLIC_APP_URL",
          "Sign-in and share links are built from it; without it they point nowhere.",
        );
      } else if (/localhost|127\.0\.0\.1/.test(appUrl) || !appUrl.startsWith("https://")) {
        block(
          "NEXT_PUBLIC_APP_URL",
          "Must be the public https address, or every emailed link sends a traveler nowhere.",
        );
      }
    }

    // Email (D-167, D-171)
    if (has("RESEND_API_KEY") !== has("EMAIL_FROM")) {
      block(
        has("RESEND_API_KEY") ? "EMAIL_FROM" : "RESEND_API_KEY",
        "RESEND_API_KEY and EMAIL_FROM are set together or not at all; half of the pair sends nothing.",
      );
    } else if (has("EMAIL_FROM") && !value("EMAIL_FROM").includes("@")) {
      block("EMAIL_FROM", 'Is not an address, e.g. "Mandhira <hello@your-domain>".');
    } else if (production && !has("RESEND_API_KEY")) {
      block(
        "RESEND_API_KEY",
        "Missing (ACCT-01). Supabase's built-in SMTP allows about two emails an hour, so without a " +
          "Resend account travelers cannot get sign-in links — and nothing errors.",
      );
    }

    // Push
    const pushNames = [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    ];
    const pushSet = pushNames.filter(has);
    if (pushSet.length === 0) {
      if (production)
        warn(
          "VAPID_PUBLIC_KEY",
          "Push is unavailable until the VAPID keys are set (`pnpm push:keys`).",
        );
    } else if (pushSet.length < pushNames.length) {
      block(
        pushNames.filter((name) => !has(name)).join(", "),
        "Push needs all four VAPID values; with some missing, travelers can subscribe and nothing is ever sent.",
      );
    } else {
      if (value("VAPID_PUBLIC_KEY") !== value("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) {
        block(
          "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
          "Differs from VAPID_PUBLIC_KEY. Browsers would subscribe with one key and the server sign with another; every push is rejected.",
        );
      }
      if (!/^(mailto:|https:)/.test(value("VAPID_SUBJECT"))) {
        block(
          "VAPID_SUBJECT",
          "Must be a mailto: or https: contact; push services reject anything else.",
        );
      }
    }

    if (production && !has("OPENROUTESERVICE_API_KEY")) {
      warn(
        "OPENROUTESERVICE_API_KEY",
        "Missing (ACCT-05). Travel times fall back to a straight-line estimate, labelled `estimated`.",
      );
    }
  }

  // ── Ops ───────────────────────────────────────────────────────────────────────────────
  if (forApp(["ops"]) && production) {
    if (!has("GEOCODING_USER_AGENT")) {
      warn(
        "GEOCODING_USER_AGENT",
        "Nominatim's usage policy asks for a contact; a generic agent may be blocked.",
      );
    }
    if (!has("NEXT_PUBLIC_MAPTILER_KEY")) {
      warn(
        "NEXT_PUBLIC_MAPTILER_KEY",
        "Missing (ACCT-03). The Ops location picker shows coordinates without a map.",
      );
    }
  }

  // ── AI: both apps ─────────────────────────────────────────────────────────────────────
  const provider = value("AI_PROVIDER") || "google";
  if (!AI_PROVIDERS.includes(provider)) {
    block("AI_PROVIDER", `Must be one of ${AI_PROVIDERS.join(", ")}.`);
  }
  const fallback = value("AI_FALLBACK_PROVIDER");
  if (fallback && fallback !== "none" && !AI_PROVIDERS.includes(fallback)) {
    block("AI_FALLBACK_PROVIDER", `Must be none or one of ${AI_PROVIDERS.join(", ")}.`);
  }
  const primaryKey = AI_KEYS[/** @type {keyof typeof AI_KEYS} */ (provider)];
  const fallbackKey = AI_KEYS[/** @type {keyof typeof AI_KEYS} */ (fallback || "anthropic")];
  if (production && primaryKey && !has(primaryKey) && !(fallbackKey && has(fallbackKey))) {
    warn(
      primaryKey,
      "Missing (ACCT-04). Describing a journey opens onto the structured questions, and Ops gets no " +
        "extraction or translation suggestions. Nothing breaks.",
    );
  }

  // ── Error tracking: both apps ─────────────────────────────────────────────────────────
  if (has("SENTRY_DSN")) {
    if (!/^https?:\/\/[^@\s]+@[^/\s]+\/(.+\/)?\d+$/.test(value("SENTRY_DSN"))) {
      block(
        "SENTRY_DSN",
        "Is not a Sentry DSN (https://<key>@<host>/<project>); failures would go nowhere.",
      );
    }
  } else if (production) {
    warn("SENTRY_DSN", "Missing (ACCT-06). Failures reach the logs only; nobody is alerted.");
  }

  return findings;
}

/**
 * At server start: log every finding, and in production refuse to start on a blocking one.
 * Outside production nothing throws — a developer without a Resend key still gets a server.
 *
 * @param {App} app
 * @param {Record<string, string | undefined>} [env]
 * @param {boolean} [production]
 * @returns {Finding[]}
 */
export function assertEnv(app, env = process.env, production = env["VERCEL_ENV"] === "production") {
  const findings = checkEnv(env, { app, production });
  for (const finding of findings) {
    const line = `[env] ${finding.level === "block" ? "BLOCK" : "warn "} ${finding.name}: ${finding.message}`;
    if (finding.level === "block") console.error(line);
    else console.warn(line);
  }

  const blocking = findings.filter((finding) => finding.level === "block");
  if (production && blocking.length > 0) {
    throw new Error(
      `Refusing to start ${app}: ${blocking.map((finding) => finding.name).join(", ")} misconfigured. See the log above.`,
    );
  }
  return findings;
}
