import { defineConfig } from "vitest/config";

// Root runner: every package/app owns its tests next to its source.
export default defineConfig({
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    passWithNoTests: true,
    // Component tests need a DOM; the token-contract test is pure Node but tolerates jsdom.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    /*
     * Serial by choice. Running several jsdom workers in parallel on the dev machine kills the
     * pool ("Channel closed" / ERR_IPC_CHANNEL_CLOSED with the forks pool; the esbuild service
     * dies with the threads pool). Serial costs a few seconds at this suite size and keeps local
     * and CI behaviour identical. Revisit if the suite grows large enough to matter.
     */
    fileParallelism: false,
  },
});
