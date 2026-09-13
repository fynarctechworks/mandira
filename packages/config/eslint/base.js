import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * Third-party SDKs that talk to a vendor. Families, not single packages: the audit found an
 * unlisted SDK (`@google/generative-ai`) passing the old fixed list untouched.
 */
export const VENDOR_SDKS = [
  "@ai-sdk/*",
  "ai",
  "openai",
  "@anthropic-ai/*",
  "@google/*",
  "@google-cloud/*",
  "@mistralai/*",
  "cohere-ai",
  "resend",
  "@resend/*",
  "nodemailer",
  "@sendgrid/*",
  "web-push",
  "openrouteservice-js",
  "@sentry/*",
  "@aws-sdk/*",
  "twilio",
  "stripe",
];

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
      // CLAUDE.md §4: vendor SDKs only inside packages/providers, which turns this off. In the
      // shared base so every package is covered, not only the Next apps.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: VENDOR_SDKS,
              message: "Vendor SDKs may only be imported inside packages/providers.",
            },
          ],
        },
      ],
    },
  },
);
