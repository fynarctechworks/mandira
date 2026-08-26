import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a DEPLOYED app (TRD §11.2 Day 20).
 *
 * Separate from `playwright.config.ts` on purpose. That one builds the apps, starts local
 * servers and seeds fixtures; this one starts nothing and creates nothing — it points at a
 * URL that is already serving real travelers and asks whether it is healthy.
 *
 * `SMOKE_BASE_URL` is required rather than defaulted. A smoke config that silently falls
 * back to localhost is a smoke config that reports a deployment healthy without ever
 * having reached it.
 */
const baseURL = process.env["SMOKE_BASE_URL"];

if (!baseURL) {
  throw new Error(
    "SMOKE_BASE_URL is not set. Point it at the deployment to smoke, e.g.\n" +
      "  SMOKE_BASE_URL=https://app.example.com pnpm test:smoke",
  );
}

export default defineConfig({
  testDir: "./tests/smoke",
  // Production, so: no retries hiding a flake, and a short timeout — a healthy deployment
  // answers quickly, and a slow one is itself the finding.
  retries: 1,
  timeout: 30_000,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL,
    ...devices["Pixel 5"],
    trace: "retain-on-failure",
  },
  projects: [{ name: "smoke" }],
});
