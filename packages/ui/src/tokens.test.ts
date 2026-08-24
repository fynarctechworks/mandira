import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colorTokens, darkOverriddenTokens } from "./tokens";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

// Split the stylesheet into its light scope, the media-query dark scope and the `.dark` scope.
const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
const classStart = css.indexOf(":root.dark");
const lightScope = css.slice(0, mediaStart);
const mediaScope = css.slice(mediaStart, classStart);
const darkClassScope = css.slice(classStart);

const declared = (scope: string, token: string) => new RegExp(`--${token}:\\s*[^;]+;`).test(scope);

const declarations = (scope: string) =>
  [...scope.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => `${k}=${v}`).sort();

describe("PRD 12.1 token contract", () => {
  it.each(colorTokens)("defines %s in the light scope", (token) => {
    expect(declared(lightScope, token)).toBe(true);
  });

  it.each(darkOverriddenTokens)("overrides %s for dark mode (class and media)", (token) => {
    expect(declared(darkClassScope, token)).toBe(true);
    expect(declared(mediaScope, token)).toBe(true);
  });

  it("keeps the explicit .dark scope identical to the media-query scope", () => {
    expect(declarations(darkClassScope)).toEqual(declarations(mediaScope));
  });

  it("uses the exact PRD brand primary values", () => {
    expect(lightScope).toMatch(/--brand-primary:\s*#ff660e;/);
    expect(darkClassScope).toMatch(/--brand-primary:\s*#ff7a30;/);
  });
});
