import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PRD §12.7's voice rules, enforced rather than reviewed (PRD-DSGN-005).
 *
 * B-024's checklist calls for a "copy review against PRD §12.7". A read-through holds until
 * the next person writes a string, so this is a test instead: it scans the traveler app's
 * user-facing text for the vocabulary the PRD forbids.
 *
 * WHY THE BAN LIST IS SHORT AND SPECIFIC. It is not a style checker. It catches the words
 * PRD §12.7 names — "error", "failed", "invalid", "URGENT", exclamation marks in system
 * messages — because those are the ones that change how a message FEELS to someone standing
 * in a queue at 5am. Tone beyond that is a judgement no regex should be making.
 *
 * The Ops app is deliberately out of scope: §12.7 governs the traveler's voice. An operator
 * at a desk trying to fix something is better served by "this failed, here is the reference"
 * than by a calm sentence that hides what happened (see `app/(ops)/error.tsx`).
 */
const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

/** Directories whose contents are not traveler-facing copy. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".next-e2e", ".turbo", "public"]);

/**
 * Files exempt, each for a stated reason.
 *
 * Kept explicit and small. An exemption list that grows without reasons is how a rule stops
 * being a rule.
 */
const EXEMPT = new Set([
  // Names the forbidden words in order to test for them.
  "lib/copy.test.ts",
  // Console diagnostics for developers, never rendered (see the boundary components).
  "app/global-error.tsx",
]);

function sourceFiles(dir: string, base = ""): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;

    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full, rel));
    } else if (
      /\.(tsx?|json)$/.test(entry) &&
      /*
       * Test files are skipped. A test's own name is never rendered, and tests discuss
       * "error" and "failure" constantly — asserting on them, or describing the case they
       * cover ("stops at the first network failure"). Scanning them teaches people to
       * rename tests to please a linter, which makes the tests worse and the copy no
       * better.
       */
      !/\.test\.(ts|tsx)$/.test(entry) &&
      !EXEMPT.has(rel)
    ) {
      out.push(rel);
    }
  }

  return out;
}

/**
 * The strings a person could actually read.
 *
 * Comments are stripped first — this file's own neighbours discuss "an error" constantly
 * while rendering nothing of the sort, and a checker that cannot tell those apart is a
 * checker everyone learns to silence.
 */
function readableText(source: string): string {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  const strings: string[] = [];

  // Double-quoted, single-quoted, and JSX text between tags.
  for (const match of withoutComments.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    strings.push(match[1] ?? "");
  }
  for (const match of withoutComments.matchAll(/>([^<>{}]{4,})</g)) {
    strings.push(match[1] ?? "");
  }

  return strings.join("\n");
}

/**
 * Words that are forbidden as COPY but legitimate as code.
 *
 * `console.error`, `onError`, `role="alert"`, a `z.string()` validation message that never
 * reaches a screen — all contain banned words and none are copy. Matched on whole words in
 * prose-like context, and code-shaped occurrences are filtered below.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\berrors?\b/i, why: 'PRD §12.7 forbids "error"' },
  { pattern: /\bfailed\b|\bfailure\b/i, why: 'PRD §12.7 forbids "failed"' },
  { pattern: /\binvalid\b/i, why: 'PRD §12.7 forbids "invalid"' },
  { pattern: /URGENT/, why: "PRD §12.7 forbids URGENT" },
  { pattern: /\boops\b/i, why: "PRD §12.7's persona is calm, not chirpy" },
  { pattern: /\bmust-see\b|\bbreathtaking\b/i, why: "PRD §12.7 forbids tourism superlatives" },
];

/**
 * Occurrences that are code, not copy.
 *
 * The interesting case is `ApiError("invalid")`. Those are `ApiErrorCode` values — the
 * machine-readable half of the `{ok:false, error:{code, message}}` envelope — and §12.7
 * governs what a PERSON reads, which is the `message` beside it. Flagging the code would
 * push someone to rename a status constant for the sake of a linter, which improves nothing
 * and makes the envelope worse.
 */
const API_ERROR_CODES = /^(invalid|unauthorized|forbidden|not_found|conflict|rate_limited|failed)$/;

function isCodeShaped(line: string): boolean {
  const trimmed = line.trim();

  // A bare status code on its own line, or inside an ApiError call.
  if (API_ERROR_CODES.test(trimmed)) return true;

  // A module specifier ("@mandhira/providers/errors", "./lib/data-error"): a path, not a sentence.
  if (/^(@[\w.-]+\/|\.{1,2}\/)?[\w.-]+(\/[\w.-]+)*$/.test(trimmed) && trimmed.includes("/")) {
    return true;
  }

  return (
    /console\.(error|warn)/.test(line) ||
    /onError|hasError|isError|errorMessage|ErrorBoundary|error\?\.|error\.|error:|\berror\b\s*[,)=]/.test(
      line,
    ) ||
    /aria-|role=|data-|className|\.test\(|z\.\w+\(/.test(line)
  );
}

describe("traveler-facing copy follows PRD §12.7", () => {
  const files = sourceFiles(appRoot);

  it("scans a meaningful number of files", () => {
    // A scanner that silently matched nothing would pass forever.
    expect(files.length).toBeGreaterThan(30);
  });

  it.each(FORBIDDEN)("never says $why", ({ pattern, why }) => {
    const offences: string[] = [];

    for (const file of files) {
      const text = readableText(readFileSync(join(appRoot, file), "utf8"));

      for (const line of text.split("\n")) {
        if (!pattern.test(line)) continue;
        if (isCodeShaped(line)) continue;
        offences.push(`${file}: ${line.trim().slice(0, 100)}`);
      }
    }

    expect(offences, why).toEqual([]);
  });

  it("never puts an exclamation mark in a system message", () => {
    /*
     * PRD §12.7 bans these in system messages specifically. Mandhira's persona is a calm
     * companion; an exclamation mark is how a calm companion starts sounding like a
     * notification.
     */
    const offences: string[] = [];

    for (const file of files) {
      const text = readableText(readFileSync(join(appRoot, file), "utf8"));

      for (const line of text.split("\n")) {
        // Ignores `!` as an operator — this only looks at sentence-final punctuation.
        if (!/[a-z]!(\s|$)/.test(line)) continue;
        offences.push(`${file}: ${line.trim().slice(0, 100)}`);
      }
    }

    expect(offences).toEqual([]);
  });
});
