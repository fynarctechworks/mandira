import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WCAG contrast of the preset's text pairings, computed from the oklch tokens themselves.
 *
 * The axe run on /design-system found three pairings under 4.5:1 that ship in the `mist`
 * palette (muted text on muted, the brand orange used as text, destructive text on its own
 * tint). A lightness check cannot see those — they depend on both colours — so this converts
 * each token to sRGB and measures, the same way a browser composites it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "design-system.css"), "utf8");

type Rgb = [number, number, number];

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} block is missing`);
  return css.slice(start, css.indexOf("\n}", start));
}

function token(selector: string, name: string): string {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(block(selector))?.[1]?.trim();
  if (!value) throw new Error(`--${name} is not declared in ${selector}`);
  return value;
}

/** oklch → linear sRGB (Björn Ottosson's OKLab matrices). */
function linear(value: string): Rgb {
  const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!match) throw new Error(`not an oklch colour: ${value}`);

  const [L, C, H] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** `color/alpha` over a background, composited in encoded sRGB as browsers do. */
function over(color: Rgb, alpha: number, background: Rgb): Rgb {
  return color.map((c, i) =>
    decode(alpha * encode(c) + (1 - alpha) * encode(background[i]!)),
  ) as Rgb;
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = ([r, g, bl]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

const themes = [
  { name: "light", selector: ":root", destructiveTint: 0.1 },
  { name: "dark", selector: ".dark", destructiveTint: 0.2 },
] as const;

describe("design system contrast", () => {
  it("reproduces #FF660E's contrast on white from its hex, so the arithmetic is trusted", () => {
    // Independent of the oklch path: straight from sRGB hex.
    const hex: Rgb = [0xff, 0x66, 0x0e].map((v) => decode(v / 255)) as Rgb;
    const white: Rgb = [1, 1, 1];

    expect(contrast(hex, white)).toBeCloseTo(2.93, 1);
    expect(contrast(linear(token(":root", "primary")), white)).toBeCloseTo(contrast(hex, white), 1);
  });

  describe.each(themes)("$name theme", ({ selector, destructiveTint }) => {
    const background = linear(token(selector, "background"));

    it("reads body text on the page", () => {
      expect(contrast(linear(token(selector, "foreground")), background)).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it("reads muted text on a muted surface", () => {
      expect(
        contrast(linear(token(selector, "muted-foreground")), linear(token(selector, "muted"))),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it("reads a brand-coloured link on the page", () => {
      expect(contrast(linear(token(selector, "primary-text")), background)).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it("reads the label on a primary button", () => {
      expect(
        contrast(linear(token(selector, "primary-foreground")), linear(token(selector, "primary"))),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it("reads destructive text on its own tint", () => {
      const destructive = linear(token(selector, "destructive"));
      expect(
        contrast(destructive, over(destructive, destructiveTint, background)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    // A destructive badge in a table sits on a card, not the page — the Ops job list (D-172).
    it("reads a destructive badge on a card", () => {
      const destructive = linear(token(selector, "destructive"));
      const card = linear(token(selector, "card"));
      expect(
        contrast(destructive, over(destructive, destructiveTint, card)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("gives a dark system setting exactly the .dark palette", () => {
    // Two copies exist only because CSS cannot share one block across a media query (D-172).
    const tokens = (selector: string) =>
      Object.fromEntries(
        [...block(selector).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
          match[1],
          match[2]!.trim(),
        ]),
      );

    expect(tokens(":root:not(.light)")).toEqual(tokens(".dark"));
  });
});
