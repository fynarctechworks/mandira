import { defineConfig } from "vitest/config";

// Root runner: every package/app owns its tests next to its source.
export default defineConfig({
  /*
   * The automatic JSX runtime for every test. `apps/web`'s tsconfig says `jsx: preserve`
   * (Next compiles JSX itself), and esbuild falls back to the classic `React.createElement`
   * when it reads that — so a component test there failed with "React is not defined"
   * though the same component builds fine. `packages/ui` already compiled this way through
   * its own tsconfig; this makes the two agree.
   */
  esbuild: { jsx: "automatic" },
  test: {
    include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    passWithNoTests: true,
    // Component tests need a DOM; the token-contract test is pure Node but tolerates jsdom.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    /*
     * Serial by choice. Running several jsdom workers in parallel on the dev machine kills
     * the pool ("Channel closed" / ERR_IPC_CHANNEL_CLOSED with the forks pool; the esbuild
     * service dies with the threads pool). Serial costs a few seconds at this suite size
     * and keeps local and CI behaviour identical. Revisit if the suite grows large enough
     * to matter.
     */
    fileParallelism: false,

    /*
     * Coverage is measured for the JOURNEY ENGINE only, and gated at 90%
     * (TESTING_STRATEGY). The engine is where a silent mistake is most expensive: a wrong
     * schedule looks exactly like a right one until a traveler misses something.
     *
     * The rest of the codebase is covered by pgTAP and Playwright against real behaviour,
     * where a line-coverage number would measure the wrong thing.
     */
    coverage: {
      provider: "v8",
      include: ["packages/journey-engine/src/**"],
      exclude: [
        "**/*.test.ts",
        // Re-exports and type declarations carry no logic to exercise.
        "packages/journey-engine/src/index.ts",
        "packages/journey-engine/src/types.ts",
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ["text-summary"],
    },
  },
});
