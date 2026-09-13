import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * CLAUDE.md §5: nothing in Ops, analytics or export code may touch `traveler_profiles`.
 *
 * AUTHORIZATION_MODEL has always claimed a CI check for this; until now it did not exist.
 * RLS already denies Ops roles (0008) and 0029 removes the service-role grant, so this is the
 * third layer: it stops the reference being written at all, which is cheaper than finding it
 * in review.
 */
const FORBIDDEN = /traveler_profiles/;

const GUARDED = [
  "apps/ops",
  "packages/providers/src",
  "packages/db/src/analytics.ts",
  "packages/db/src/reporting.ts",
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-e2e", ".turbo", "coverage"]);
const EXTENSIONS = /\.(ts|tsx|js|mjs|sql)$/;

const root = process.cwd();
const hits = [];

function scan(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) return;

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (!SKIP_DIRS.has(entry)) scan(join(path, entry));
    }
    return;
  }

  if (!EXTENSIONS.test(path)) return;
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (FORBIDDEN.test(line)) hits.push(`${relative(root, path)}:${index + 1}: ${line.trim()}`);
    });
}

for (const target of GUARDED) scan(join(root, target));

if (hits.length > 0) {
  console.error("traveler_profiles is referenced where it must never be (CLAUDE.md §5):\n");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(
  `Privacy boundary holds: no traveler_profiles reference in ${GUARDED.length} guarded paths.`,
);
