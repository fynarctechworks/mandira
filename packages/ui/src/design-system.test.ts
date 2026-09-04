import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The shadcn `base-lyra` design system resolves to Mandhira's orange, readably.
 *
 * THE BUG THIS EXISTS TO CATCH. The preset ships a dark primary (#ca3500) with a near-white
 * foreground, and that pairing is fine. Mandhira's brand orange is #FF660E, which is much
 * lighter — it scores 2.93:1 against white. Keeping the preset's near-white foreground while
 * swapping in the lighter orange therefore fails WCAG on every primary button, badge and
 * sidebar item at once, and it fails invisibly: the page still renders, the colours still
 * look like the brand, and only a contrast check tells you the label is unreadable.
 *
 * It is an easy regression to reintroduce, because a near-white foreground is what every
 * upstream shadcn example shows and what a future `shadcn init` would write back.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "design-system.css"), "utf8");

/** The `:root` block, and the `.dark` block, read separately. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block is missing`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start));
}

function token(selector: string, name: string): string | undefined {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(block(selector))?.[1]?.trim();
}

/** oklch lightness, the first number in `oklch(L C H)`. */
function lightness(value: string): number {
  const l = /oklch\(\s*([\d.]+)/.exec(value)?.[1];
  expect(l, `not an oklch value: ${value}`).toBeDefined();
  return Number(l);
}

/** #FF660E converted to oklch — the brand orange, and the only orange. */
const BRAND = "oklch(0.696 0.203 42.743)";

describe("the base-lyra design system", () => {
  it.each(["light", "dark"])("uses #FF660E as the primary in %s", (mode) => {
    expect(token(mode === "light" ? ":root" : ".dark", "primary")).toBe(BRAND);
  });

  it.each([
    [":root", "primary-foreground"],
    [".dark", "primary-foreground"],
    [":root", "sidebar-primary-foreground"],
    [".dark", "sidebar-primary-foreground"],
  ])("keeps %s %s dark enough to read on #FF660E", (selector, name) => {
    const value = token(selector, name);
    expect(value).toBeDefined();

    /*
     * Ink, not near-white. #FF660E has an oklch lightness of 0.696; anything approaching it
     * from above is the 2.93:1 failure. 0.35 is comfortably below the orange and well inside
     * the 4.5:1 the PRD requires — the shipped value is 0.216, which measures 5.69:1.
     */
    expect(lightness(value!)).toBeLessThan(0.35);
  });

  it("gives the focus ring the brand colour in both themes", () => {
    expect(token(":root", "ring")).toBe(BRAND);
    expect(token(".dark", "ring")).toBe(BRAND);
  });

  it("anchors the whole chart ramp on the brand hue", () => {
    const hues = [...block(":root").matchAll(/--chart-\d:\s*oklch\([\d.]+ [\d.]+ ([\d.]+)\)/g)].map(
      (m) => m[1],
    );

    // Five series, one hue. A stray hue here is a chart that stops reading as one family.
    expect(hues).toHaveLength(5);
    expect(new Set(hues)).toEqual(new Set(["42.743"]));
  });

  it("keeps the Noto subsets in the sans stack", () => {
    /*
     * Adopting the preset's typography must not quietly drop Telugu and Devanagari to a
     * system fallback. Two of the three locales this product ships are written in them.
     */
    const sans = /--font-sans:\s*([^;]+);/.exec(css)?.[1];
    expect(sans).toContain("--font-noto-telugu");
    expect(sans).toContain("--font-noto-devanagari");
  });

  it("declares every name a generated component reaches for", () => {
    const CONTRACT = [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "border",
      "input",
      "ring",
      "radius",
    ];

    // A name nobody declared emits no utility at all, which renders as invisible text
    // rather than as an obvious break.
    for (const name of CONTRACT) {
      expect(token(":root", name), `--${name} is not declared`).toBeDefined();
      expect(css).toContain(`--color-${name === "radius" ? "background" : name}:`);
    }
  });
});
