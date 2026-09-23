import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * The route JS budget (TRD-PERF-001: ≤180 kB first load).
 *
 * A budget measured once is a number in a document; a budget checked on every build is a
 * budget. B-024 measured four routes over it — sign-in at 224 kB, because `@supabase/ssr`
 * was statically imported into a form with one text field — and none of that was visible
 * to anyone until somebody looked.
 *
 * Reads Next's own build manifest rather than scraping the console table, so it does not
 * break when the table's formatting changes.
 *
 * Usage: `node scripts/check-bundle.mjs apps/web`
 */
const BUDGET_KB = 180;

/**
 * Routes allowed to exceed, each with a reason and a ceiling of its own.
 *
 * Deliberately small and individually justified. An exemption list that grows without
 * reasons is how a budget stops being a budget — so every line here has to say what the
 * weight buys and why it cannot be deferred.
 */
const ALLOWANCES = {
  /*
   * Live used to have an allowance of 190 kB here, for the engine, the Dexie read path and
   * the outbox it needs to replan with no network. By September it measured 191.6 kB and CI
   * had failed on it for every push. The engine stayed; the sheets that are only opened by a
   * tap (delay picker, change sheet, trust sheet, report form) moved out of the first load
   * and it measured 167.2 kB — inside the ordinary budget, so the allowance went (D-232).
   * The service worker precaches every chunk, so the deferred sheets still open offline.
   *
   * Not a traveler route. `/design-system` sits outside `[locale]`, is `noindex`, and exists
   * so the team can see every preset component in both themes at once (D-148). Rendering the
   * whole library IS its job, so its first load is the library; a traveler never requests it.
   */
  "/design-system": {
    kb: 540,
    why: "Staff-only component reference outside the traveler route tree (D-148); it renders the entire preset library by design and is never loaded by a traveler.",
  },
};

const appDir = process.argv[2];
if (!appDir) {
  console.error("Usage: node scripts/check-bundle.mjs <appDir>");
  process.exit(2);
}

const distDir = process.env["NEXT_DIST_DIR"] ?? ".next";
const manifestPath = join(appDir, distDir, "app-build-manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`No build manifest at ${manifestPath}. Build first.`);
  process.exit(2);
}

const bytes = new Map();

/**
 * Total size of the JS a route loads, deduplicated across shared chunks.
 *
 * GZIPPED, because that is what Next's own build table reports and therefore what
 * TRD-PERF-001's 180 kB refers to. Measuring raw bytes reads about three times higher and
 * would fail every route on day one — a budget nobody can meet is a budget everybody
 * switches off.
 */
function routeKb(files) {
  let total = 0;
  const seen = new Set();

  for (const file of files) {
    if (!file.endsWith(".js") || seen.has(file)) continue;
    seen.add(file);

    if (!bytes.has(file)) {
      try {
        bytes.set(file, gzipSync(readFileSync(join(appDir, distDir, file))).byteLength);
      } catch {
        bytes.set(file, 0);
      }
    }
    total += bytes.get(file);
  }

  return total / 1024;
}

const rows = Object.entries(manifest.pages ?? {})
  .filter(([route]) => !route.startsWith("/api/"))
  // Manifest keys carry a trailing segment (`/page`, `/route`); the route is the rest.
  .map(([route, files]) => ({
    route: route.replace(/\/(page|route)$/, "") || "/",
    kb: routeKb(files),
  }))
  .sort((a, b) => b.kb - a.kb);

const over = [];
for (const { route, kb } of rows) {
  const allowance = ALLOWANCES[route];
  const ceiling = allowance?.kb ?? BUDGET_KB;
  const status = kb > ceiling ? "OVER" : allowance ? "allowed" : "ok";

  console.log(`${status.padEnd(8)} ${kb.toFixed(1).padStart(7)} kB  ${route}`);
  if (kb > ceiling) over.push({ route, kb, ceiling });
}

if (over.length > 0) {
  console.error(`\n${over.length} route(s) over budget (${BUDGET_KB} kB, TRD-PERF-001):`);
  for (const { route, kb, ceiling } of over) {
    console.error(`  ${route} — ${kb.toFixed(1)} kB, ceiling ${ceiling} kB`);
  }
  console.error("\nDefer what is only needed after an interaction, or justify an allowance.");
  process.exit(1);
}

console.log(`\nAll ${rows.length} routes within budget.`);
