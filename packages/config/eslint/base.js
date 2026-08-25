import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/** Shared flat config for every workspace package. */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      // The E2E suite builds here so a run never clobbers a running dev server; it is
      // compiled output either way (see the apps' next.config.ts).
      "**/.next-e2e/**",
      "**/dist/**",
      "**/.turbo/**",
      // Build artifacts, not source: the service worker bundle Serwist emits into public/.
      "**/public/sw.js",
      "**/public/swe-worker-*.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
