import { defineConfig, devices } from "@playwright/test";

/*
 * Dedicated high ports, not 3000/3001.
 *
 * The dev machine runs other projects' servers on the common ports, and a suite that
 * silently tests someone else's app is worse than one that fails — during B-007 a probe
 * against :3001 was answered by an unrelated application.
 */
const WEB_PORT = Number(process.env["MANDHIRA_WEB_PORT"] ?? 3986);
const OPS_PORT = Number(process.env["MANDHIRA_OPS_PORT"] ?? 3987);

const OPS_STORAGE_STATE = "tests/e2e/.auth/ops-admin.json";
const WEB_STORAGE_STATE = "tests/e2e/.auth/traveler.json";

/*
 * The E2E suite builds and serves from its own directory, so a run never clobbers a dev
 * server the developer has open — see the note in the apps' next.config.ts.
 */
const E2E_DIST_DIR = ".next-e2e";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  /*
   * Capped workers. This machine cannot sustain many browser workers alongside the two
   * Next servers and the Supabase stack — an uncapped run died with a hard worker crash
   * (0xC0000409). The same constraint already forced serial vitest (D-024).
   */
  workers: 3,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    /*
     * Most traveler screens are guest-first, so this project signs in to NOTHING — that is
     * the state a first-time visitor arrives in, and testing it any other way would miss
     * every guest-facing path.
     */
    {
      name: "web-mobile",
      use: { ...devices["Pixel 5"], baseURL: `http://localhost:${WEB_PORT}` },
      testMatch: /web[\\/].*\.spec\.ts/,
      testIgnore: /web[\\/](journey-builder|prepare|live)\.spec\.ts/,
    },

    // Signing a traveler in once, for the same reason the Ops setup exists: GoTrue
    // rate-limits magic-link sends per address.
    {
      name: "web-setup",
      use: { ...devices["Pixel 5"], baseURL: `http://localhost:${WEB_PORT}` },
      testMatch: /web[\\/]auth\.setup\.ts/,
    },

    // The builder and Prepare are the traveler surfaces that need an account. The share
    // link they produce is deliberately opened from a fresh, signed-out context inside
    // those specs rather than from a project of its own.
    {
      name: "web-traveler",
      use: {
        ...devices["Pixel 5"],
        baseURL: `http://localhost:${WEB_PORT}`,
        storageState: WEB_STORAGE_STATE,
      },
      testMatch: /web[\\/](journey-builder|prepare|live)\.spec\.ts/,
      dependencies: ["web-setup"],
    },

    // Signs in once; every other Ops test reuses the session. GoTrue rate-limits
    // magic-link sends per address, so a suite where each test requests its own link
    // fails as soon as it grows.
    {
      name: "ops-setup",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${OPS_PORT}` },
      testMatch: /ops[\\/]auth\.setup\.ts/,
    },

    // The gate spec must start signed OUT — signing in is what it verifies.
    {
      name: "ops-anon",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${OPS_PORT}` },
      testMatch: /ops[\\/](auth-gate|shell)\.spec\.ts/,
    },

    {
      name: "ops-desktop",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${OPS_PORT}`,
        storageState: OPS_STORAGE_STATE,
      },
      dependencies: ["ops-setup"],
      testMatch: /ops[\\/](shell-nav|editors|knowledge|trust|publish)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @mandhira/web exec next start --port ${WEB_PORT}`,
      env: { NEXT_DIST_DIR: E2E_DIST_DIR },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @mandhira/ops exec next start --port ${OPS_PORT}`,
      env: { NEXT_DIST_DIR: E2E_DIST_DIR },
      url: `http://localhost:${OPS_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
