"use client";

import { Section, Specimen } from "./shell";

/**
 * The tokens every component below resolves against. Each swatch reads its colour from the
 * live CSS variable rather than a hard-coded hex, so this section cannot drift from
 * `design-system.css` — if a token changes, the swatch changes with it.
 */

const SURFACES = [
  ["--background", "Page ground"],
  ["--foreground", "Body text"],
  ["--card", "Raised surface"],
  ["--popover", "Floating surface"],
  ["--muted", "Recessed fill"],
  ["--muted-foreground", "Secondary text"],
  ["--accent", "Accent fill"],
  ["--border", "Hairlines"],
] as const;

const BRAND = [
  ["--primary", "Mandhira orange #FF660E"],
  ["--primary-foreground", "Ink on orange — 5.69:1"],
  ["--secondary", "Neutral fill"],
  ["--destructive", "Broken / cannot work"],
  ["--ring", "Focus ring"],
] as const;

const CHARTS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] as const;

/**
 * What an axe run against this page reports, kept here rather than in a doc nobody opens.
 *
 * All three come from the preset's `mist` palette combined with #FF660E, not from anything
 * Mandhira added — which is why they are stated rather than quietly patched: the founder
 * took the preset verbatim (D-148), and changing these values is a decision, not a fix.
 */
const CONTRAST_FAILURES = [
  {
    pair: "--muted-foreground on --muted",
    ratio: "4.13:1",
    where: "Kbd, AvatarFallback, ItemDescription, AspectRatio — any secondary text on a muted fill",
  },
  {
    pair: "--primary as TEXT on --background",
    ratio: "2.93:1",
    where: 'Button and Badge variant="link", HoverCard trigger',
  },
  {
    pair: "--destructive on --destructive/10",
    ratio: "3.98:1",
    where: 'Button and Badge variant="destructive"',
  },
] as const;

const RADII = [
  ["--radius-sm", "0.375rem"],
  ["--radius-md", "0.5rem"],
  ["--radius-lg", "0.625rem"],
  ["--radius-xl", "0.875rem"],
  ["--radius-2xl", "1.125rem"],
  ["--radius-3xl", "1.375rem"],
] as const;

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <div className="w-40">
      <div
        className="h-14 w-full rounded-md border border-border"
        style={{ background: `var(${token})` }}
      />
      <p className="mt-1.5 font-mono text-[11px]">{token}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function Foundations() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      summary="Colour, radius and type for the shadcn base-lyra preset, with the brand orange set to #FF660E. Swatches read the live CSS variables, so they always show what the components are actually using."
    >
      <Specimen name="Brand & intent" note="oklch(0.696 0.203 42.743) = #FF660E">
        {BRAND.map(([t, l]) => (
          <Swatch key={t} token={t} label={l} />
        ))}
      </Specimen>

      <Specimen
        name="Primary on its foreground"
        note="The preset ships a near-white foreground for its darker orange; #FF660E scores 2.93:1 on white, so the foreground here is ink instead."
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <div className="flex-1 rounded-md bg-primary p-6 text-primary-foreground">
            <p className="font-heading text-lg font-semibold">Ink on orange</p>
            <p className="text-sm">5.69:1 — passes AA for body text.</p>
          </div>
          <div className="flex-1 rounded-md border border-border bg-primary p-6 text-white">
            <p className="font-heading text-lg font-semibold">White on orange</p>
            <p className="text-sm">2.93:1 — fails. This is what the page must never do.</p>
          </div>
        </div>
      </Specimen>

      <Specimen name="Surfaces & neutrals" note="base colour: mist">
        {SURFACES.map(([t, l]) => (
          <Swatch key={t} token={t} label={l} />
        ))}
      </Specimen>

      <Specimen
        name="Chart ramp"
        note="Re-anchored on the #FF660E hue so series read as one family"
      >
        {CHARTS.map((t, i) => (
          <Swatch key={t} token={t} label={`Series ${i + 1}`} />
        ))}
      </Specimen>

      <Specimen name="Radius scale" note="--radius: 0.625rem, scaled by the preset">
        {RADII.map(([t, v]) => (
          <div key={t} className="w-32">
            <div
              className="h-14 w-full border border-border bg-muted"
              style={{ borderRadius: `var(${t})` }}
            />
            <p className="mt-1.5 font-mono text-[11px]">{t}</p>
            <p className="text-[11px] text-muted-foreground">{v}</p>
          </div>
        ))}
      </Specimen>

      <Specimen
        name="Known contrast failures"
        note="Measured with axe on this page. These are the preset's own palette, not Mandhira's additions — they will follow the redesign onto every route."
        className="block"
      >
        {/* tabIndex so the table can be scrolled by keyboard as well as by pointer. */}
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Pair</th>
                <th className="py-1.5 pr-4 font-medium">Ratio</th>
                <th className="py-1.5 font-medium">Where it shows</th>
              </tr>
            </thead>
            <tbody className="border-t border-border">
              {CONTRAST_FAILURES.map((row) => (
                <tr key={row.pair} className="border-b border-border">
                  <td className="py-2 pr-4 font-mono text-xs">{row.pair}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.ratio}</td>
                  <td className="py-2 text-xs text-muted-foreground">{row.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-2xl text-xs text-muted-foreground">
          The palette this replaced had all 47 of its pairs verified at 4.5:1 (D-025). These three
          are open, and they are the reason `--primary` is never used for text on a light ground in
          Mandhira&rsquo;s own components.
        </p>
      </Specimen>

      <Specimen
        name="Type"
        note="Outfit for headings, Inter for body — the preset's pairing"
        className="block"
      >
        <div className="space-y-2">
          <p className="font-heading text-4xl font-semibold tracking-tight">Display — Outfit</p>
          <p className="font-heading text-2xl font-semibold tracking-tight">Heading — Outfit</p>
          <p className="text-base">
            Body — Inter. A pilgrimage planned around what matters to you.
          </p>
          <p className="text-sm text-muted-foreground">Secondary — Inter at 14px.</p>
          <p className="text-xs text-muted-foreground">Caption — Inter at 12px.</p>
          <p className="text-base">తెలుగు — Noto Sans Telugu stays in the stack.</p>
          <p className="text-base">हिन्दी — Noto Sans Devanagari stays in the stack.</p>
        </div>
      </Specimen>
    </Section>
  );
}
