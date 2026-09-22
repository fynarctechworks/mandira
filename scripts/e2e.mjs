#!/usr/bin/env node
/**
 * Builds both apps into the E2E build directory, then runs Playwright.
 *
 * The point of the separate directory is that `next dev` and `next build` otherwise both
 * write to `.next`, so running the suite while a dev server is open corrupts that server's
 * chunks — it answers every route with "Cannot find module ./NNN.js" until the directory
 * is deleted. `NEXT_DIST_DIR` is read by both apps' next.config.ts and by the Playwright
 * webServer commands, so build and serve agree.
 *
 * A node script rather than an inline env assignment because `FOO=bar cmd` is not valid
 * on Windows shells, and this repo is developed on one.
 *
 * Pass anything through: `pnpm test:e2e tests/e2e/web` or `pnpm test:e2e --ui`.
 */
import { spawnSync } from "node:child_process";

const DIST = ".next-e2e";
const args = process.argv.slice(2);

const env = { ...process.env, NEXT_DIST_DIR: DIST };

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Reset the LOCAL rate-limit counters before the suite runs.
 *
 * Not a bypass, and the distinction matters (CLAUDE.md §5 forbids weakening a rate limit
 * even in tests). The limits themselves are untouched and still asserted in pgTAP `0010`;
 * this clears the accumulated COUNTERS in a local development database, the way any other
 * fixture is reset between runs.
 *
 * Without it the suite quietly stops working after a few runs in one day: `share_create`
 * is 10 per day per user (TRD §6.2), the prepare spec mints several links per run, and the
 * fourth run of an afternoon starts failing with 429s that look like product bugs. That
 * cost real time to diagnose, which is the argument for doing it here rather than
 * remembering to do it by hand.
 */
function resetRateLimits() {
  const result = spawnSync(
    "docker",
    [
      "exec",
      process.env["SUPABASE_DB_CONTAINER"] ?? "supabase_db_Mandira",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-q",
      "-c",
      "truncate rate_limits;",
    ],
    /*
     * NOT `shell: true`. On Windows the shell re-splits the argument array on spaces, so
     * `truncate rate_limits;` arrives as two arguments and psql fails with "syntax error at
     * end of input" — which looks nothing like a quoting problem. `docker` is a real
     * executable and needs no shell.
     */
    { stdio: "ignore", env },
  );

  if (result.status !== 0) {
    // Not fatal: the suite still runs, it just may hit a limit it accumulated earlier.
    console.warn("note: could not reset rate limits — a long run may hit 429s.");
  }
}

resetRateLimits();

/*
 * One build at a time. Turbo runs the two apps' builds in parallel by default, and two
 * Next production builds together exhaust the heap on a 16 GB Windows machine — the Ops
 * worker dies with "Fatal process out of memory: Zone" and an exit code (2147483651) that
 * looks like a crash rather than a resource limit. Serial costs about forty seconds and
 * removes a failure that reads as a code bug every time it happens.
 */
run("pnpm", ["turbo", "run", "build", "--concurrency=1"]);
run("pnpm", ["exec", "playwright", "test", ...args]);
