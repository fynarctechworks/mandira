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

run("pnpm", ["turbo", "run", "build"]);
run("pnpm", ["exec", "playwright", "test", ...args]);
