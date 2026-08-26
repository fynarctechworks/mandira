/**
 * Refuse a deploy that is misconfigured, before a traveler finds out (TRD-DEPL-001).
 *
 * Every check here corresponds to something that would otherwise fail QUIETLY in
 * production — not with a crash, which someone would notice, but with a screen that looks
 * fine and does the wrong thing. A localhost Supabase URL baked into a client bundle. A
 * magic link that never arrives because no sending domain was verified. A cron endpoint
 * left unauthenticated.
 *
 * Usage: `node scripts/preflight.mjs [--env production]`
 *
 * Exit 0 = safe to deploy. Exit 1 = do not.
 */
const target = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : (process.env["VERCEL_ENV"] ?? "development");

const isProduction = target === "production";

/** @type {{ level: "fail" | "warn", message: string, why: string }[]} */
const findings = [];

const fail = (message, why) => findings.push({ level: "fail", message, why });
const warn = (message, why) => findings.push({ level: "warn", message, why });

const value = (name) => (process.env[name] ?? "").trim();
const has = (name) => value(name).length > 0;

// ── Supabase ────────────────────────────────────────────────────────────────
if (!has("NEXT_PUBLIC_SUPABASE_URL")) {
  fail("NEXT_PUBLIC_SUPABASE_URL is missing", "Nothing can read or write without it.");
} else if (isProduction) {
  const url = value("NEXT_PUBLIC_SUPABASE_URL");

  if (/localhost|127\.0\.0\.1/.test(url)) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL points at localhost",
      "This value is baked into the CLIENT bundle at build time. Deployed, every browser " +
        "would try to reach a database on the visitor's own machine — the app loads, and " +
        "nothing works, with no server-side clue why.",
    );
  }

  if (!url.startsWith("https://")) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL is not https",
      "An anon key over http is an anon key in public.",
    );
  }
}

if (!has("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", "Every read is anonymous until this exists.");
}

if (!has("SUPABASE_SERVICE_ROLE_KEY")) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY is missing",
    "The rate limiter runs on it. Without it `consume_rate_limit` fails CLOSED and every " +
      "rate-limited route answers 429 — which is exactly how B-019 lost an afternoon.",
  );
}

/*
 * The one that would be a genuine incident. `NEXT_PUBLIC_` is Next's marker for "inline
 * this into the browser bundle": a service-role key with that prefix is published to every
 * visitor, and it bypasses RLS entirely.
 */
for (const name of Object.keys(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_")) continue;

  if (/SERVICE_ROLE|SECRET|PRIVATE/.test(name)) {
    fail(
      `${name} is exposed to the browser`,
      "Anything prefixed NEXT_PUBLIC_ is inlined into the client bundle. A service-role " +
        "key there bypasses RLS for anyone who opens devtools.",
    );
  }
}

// ── Things that are only a problem in production ────────────────────────────
if (isProduction) {
  if (!has("NEXT_PUBLIC_APP_URL")) {
    fail(
      "NEXT_PUBLIC_APP_URL is missing",
      "Magic links and share links are built from it; without it they point nowhere.",
    );
  } else if (/localhost/.test(value("NEXT_PUBLIC_APP_URL"))) {
    fail(
      "NEXT_PUBLIC_APP_URL points at localhost",
      "Every magic link sent to a real traveler would send them to their own machine.",
    );
  }

  if (!has("RESEND_API_KEY")) {
    fail(
      "RESEND_API_KEY is missing (ACCT-01)",
      "Supabase's built-in SMTP allows about two emails an hour. Sign-in is a magic link, " +
        "so without this most travelers simply cannot get in — and nothing errors.",
    );
  }

  if (!has("CRON_SECRET")) {
    fail(
      "CRON_SECRET is missing",
      "The keepalive route answers 404 without it, so the free-tier Supabase project " +
        "pauses after a week of low traffic and the whole app stops.",
    );
  } else if (value("CRON_SECRET").length < 24) {
    fail(
      "CRON_SECRET is too short",
      "It guards a database-touching endpoint. Use 32+ random chars.",
    );
  }

  // ── Degradations, not failures ────────────────────────────────────────────
  if (!has("SENTRY_DSN")) {
    warn(
      "SENTRY_DSN is missing (ACCT-06)",
      "Failures still reach the structured console reporter and Vercel's logs. Nobody is " +
        "alerted, so the first report of a problem will be a person.",
    );
  }

  if (!has("GOOGLE_GENERATIVE_AI_API_KEY")) {
    warn(
      "GOOGLE_GENERATIVE_AI_API_KEY is missing (ACCT-04)",
      "Intent extraction refuses up front rather than failing mid-request. The structured " +
        "brief still works — that path never needed a model.",
    );
  }

  if (!has("OPENROUTESERVICE_API_KEY")) {
    warn(
      "OPENROUTESERVICE_API_KEY is missing (ACCT-05)",
      "Travel times fall back to the straight-line estimate and are labelled `estimated`. " +
        "Honest and slightly pessimistic — a working product, not a broken one.",
    );
  }

  if (!has("NEXT_PUBLIC_VAPID_PUBLIC_KEY") || !has("VAPID_PRIVATE_KEY")) {
    warn("VAPID keys are missing", "Push notifications are unavailable. Nothing else is affected.");
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const failures = findings.filter((f) => f.level === "fail");
const warnings = findings.filter((f) => f.level === "warn");

console.log(`Preflight — ${target}\n`);

for (const { level, message, why } of findings) {
  console.log(`${level === "fail" ? "BLOCK" : " warn"}  ${message}`);
  console.log(`        ${why}\n`);
}

if (failures.length === 0 && warnings.length === 0) {
  console.log("Everything this can check looks right.\n");
}

if (failures.length > 0) {
  console.error(`${failures.length} blocking issue(s). Do not deploy.`);
  process.exit(1);
}

console.log(
  warnings.length > 0
    ? `Safe to deploy, with ${warnings.length} degradation(s) above — each is a feature that ` +
        "will be absent, not broken."
    : "Safe to deploy.",
);
