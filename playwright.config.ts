import { defineConfig, devices } from "@playwright/test";

// Scaffold only (B-001). Starts both apps on dedicated ports; wired to preview URLs in B-025.
// reuseExistingServer stays false so an unrelated dev server on a common port can never be
// mistaken for ours.
const WEB_PORT = 4300;
const OPS_PORT = 4301;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
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
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @mandhira/ops exec next start --port ${OPS_PORT}`,
      url: `http://localhost:${OPS_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
