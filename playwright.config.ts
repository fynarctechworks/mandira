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

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    {
      name: "web-mobile",
      use: { ...devices["Pixel 5"], baseURL: `http://localhost:${WEB_PORT}` },
      testMatch: /web[\\/].*\.spec\.ts/,
    },
    {
      name: "ops-desktop",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${OPS_PORT}` },
      testMatch: /ops[\\/].*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @mandhira/web exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @mandhira/ops exec next start --port ${OPS_PORT}`,
      url: `http://localhost:${OPS_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
