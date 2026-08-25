import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The shadcn token contract holds, and resolves to Mandhira's palette.
 *
 * `packages/ui` was built in shadcn's idiom by hand; the CLI is now wired up, so any
 * component added from the registry arrives written against shadcn's OWN variable names.
 * The bridge aliases those onto PRD §12.1 tokens rather than letting `shadcn init` write a
 * second palette — a palette whose contrast ratios nobody has checked against this
 * product's 4.5:1 requirement.
 *
 * Two ways that breaks quietly, and one test each:
 *
 *   1. A component uses a contract name nobody mapped. Tailwind emits no utility, the
 *      class does nothing, and the element renders transparent-on-transparent — which
 *      looks like a styling nit and is actually invisible text.
 *   2. Someone "fixes" a mapping by inlining a hex. The alias still resolves, the
 *      component still renders, and colour now has two sources of truth — the one that
 *      flips in dark mode and the one that does not.
 */
const here = dirname(fileURLToPath(import.meta.url));
const bridge = readFileSync(join(here, "../../config/tailwind/shadcn-bridge.css"), "utf8");
const tokens = readFileSync(join(here, "tokens.css"), "utf8");

/** Every variable a shadcn-generated component may reach for. */
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
  "destructive-foreground",
  "border",
  "input",
  "ring",
];

const mapping = (name: string): string | undefined =>
  new RegExp(`--color-${name}:\\s*([^;]+);`).exec(bridge)?.[1]?.trim();

describe("the shadcn token bridge", () => {
  it.each(CONTRACT)("maps --color-%s", (name) => {
    expect(mapping(name)).toBeDefined();
  });

  it.each(CONTRACT)("resolves --color-%s to a Mandhira token, never a literal", (name) => {
    const value = mapping(name);

    // `var(--something)` and nothing else. A hex here is the second-palette bug.
    expect(value).toMatch(/^var\(--[\w-]+\)$/);
  });

  it.each(CONTRACT)("points --color-%s at a token that actually exists", (name) => {
    const token = /^var\((--[\w-]+)\)$/.exec(mapping(name) ?? "")?.[1];
    expect(token).toBeDefined();

    // Declared in tokens.css, so an alias cannot outlive the token it names.
    expect(new RegExp(`${token}:\\s*[^;]+;`).test(tokens)).toBe(true);
  });

  it("gives shadcn a --radius so generated controls match the ones already on screen", () => {
    expect(/--radius:\s*var\(--radius-input\);/.test(bridge)).toBe(true);
  });

  it("keeps the brand FILL and the brand TEXT colour apart", () => {
    /*
     * The trap this pins down. `--brand-primary-text` is the accessible colour for
     * brand-coloured TEXT on a light background (D-025); it is NOT the ink that sits on a
     * brand-coloured fill. Using it as `primary-foreground` puts #c14600 on #ff660e —
     * about 2:1, and every primary button in the app fails WCAG at once.
     */
    expect(mapping("primary")).toBe("var(--brand-primary)");
    expect(mapping("primary-foreground")).toBe("var(--text-on-primary)");
  });
});
