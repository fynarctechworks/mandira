import { defineConfig } from "vitest/config";

// Root runner: every package/app owns its tests next to its source.
export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    passWithNoTests: true,
  },
});
