/**
 * Refuse a deploy that is misconfigured, before a traveler finds out (TRD-DEPL-001).
 *
 * Every rule corresponds to something that would otherwise fail QUIETLY in production — not
 * with a crash, which someone would notice, but with a screen that looks fine and does the
 * wrong thing. The rules live in `packages/config/env-rules.mjs`, shared with each app's
 * server start, so this gate and the running app agree on what "configured" means.
 *
 * Usage: `node scripts/preflight.mjs [--env production]`
 *
 * Exit 0 = safe to deploy. Exit 1 = do not.
 */
import { checkEnv } from "../packages/config/env-rules.mjs";

const target = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : (process.env["VERCEL_ENV"] ?? "development");

const findings = checkEnv(process.env, { app: "all", production: target === "production" });
const failures = findings.filter((finding) => finding.level === "block");
const warnings = findings.filter((finding) => finding.level === "warn");

console.log(`Preflight — ${target}\n`);

for (const { level, name, message } of findings) {
  console.log(`${level === "block" ? "BLOCK" : " warn"}  ${name}`);
  console.log(`        ${message}\n`);
}

if (findings.length === 0) {
  console.log("Everything this can check looks right.\n");
}

if (failures.length > 0) {
  console.error(`${failures.length} blocking issue(s). Do not deploy.`);
  process.exit(1);
}

console.log(
  warnings.length > 0
    ? `Safe to deploy, with ${warnings.length} degradation(s) above — each is a feature that ` +
        "will be absent, not broken."
    : "Safe to deploy.",
);
