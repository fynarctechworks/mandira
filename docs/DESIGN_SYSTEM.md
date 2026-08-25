# Design system — how UI gets built in Mandhira

Two layers, and the distinction is the whole point.

| Layer | Where | What it is |
|---|---|---|
| **Primitives** | `packages/ui/src/components/*` from the shadcn registry | Unopinionated building blocks — `Button`, `Input`, `Label`, `Alert`. No product knowledge. |
| **Mandhira components** | `packages/ui/src/components/*` written here | The opinionated layer that encodes PRD rules — `TierChip`, `TrustBadge`, `HealthPill`, `ChangeCard`, `NowCard`, `ChecklistRow`, `TrustSheet`. |

A `TierChip` is not a `Badge` with a colour. It is the traveler's own statement of what
matters, and the option ladder reads it (PRD-PLAN-002). A `TrustBadge` is not a status
pill — it is the difference between a fact someone verified and a fact nobody has. **These
never get replaced by registry components**, and a registry component is never given
product meaning.

---

## Adding a component

```bash
pnpm ui:add <name>          # e.g. pnpm ui:add dialog
```

Then export it from `packages/ui/src/index.ts`. Only add what a screen actually uses —
CLAUDE.md §4 forbids speculative abstractions, and the registry being one command away is
exactly why keeping spares is unnecessary.

The **shadcn MCP server** is configured in `.mcp.json` and pinned to the workspace's own
`shadcn` dependency rather than floating on `@latest`, so a registry change cannot alter
what a build produces. It becomes available after restarting Claude Code; `/mcp` shows its
status.

---

## Colour: one palette, aliased

`packages/ui` was already built in shadcn's idiom by hand — Radix, `cva`, `cn`, Tailwind —
but with no `components.json`, so every primitive had to be written from scratch. Wiring
the CLI up means registry components can be dropped in; those are written against shadcn's
**own** variable names (`bg-background`, `text-muted-foreground`, `border-border`).

The obvious move is `shadcn init`, which writes its default palette into the stylesheet.
**We deliberately did not.** PRD §12.1's colours carry verified contrast ratios and
documented decisions — D-025 on `brand.primary.text`, D-039 on the soft fill an active nav
item sits on, OPEN-008. A second palette beside them means two sources of truth for colour,
and shadcn's has never been checked against this product's 4.5:1 requirement.

So `packages/config/tailwind/shadcn-bridge.css` **aliases** the contract onto Mandhira
tokens. A registry component renders in Mandhira's colours the moment it lands, dark mode
included — the base tokens already flip under `prefers-color-scheme`, and an alias inherits
that.

`packages/ui/src/shadcn-bridge.test.ts` holds it: every contract name maps, every mapping
resolves to `var(--a-mandhira-token)` and never a hex, and every token it names exists.
It also pins the one trap worth naming — `--brand-primary-text` is the accessible colour
for brand-coloured **text on a light background**, *not* the ink that sits on a
brand-coloured fill. Using it as `primary-foreground` puts `#c14600` on `#ff660e`, about
2:1, and every primary button fails WCAG at once.

**Rule:** aliases point into `tokens.css`, never the other way, and never at a literal.

---

## Imports inside `packages/ui`

Registry components import `cn` via the Node subpath import `#lib/cn`, declared in
`packages/ui/package.json`.

Not `@/lib/utils`. Both apps list `@mandhira/ui` in `transpilePackages`, so this package's
source is compiled by the **app's** resolver — a `@/` alias here would resolve against
`apps/web/*` and break in ways that are hard to trace. Subpath imports are package-scoped
by design and resolve identically in TypeScript, Next, and Vitest.

---

## Deliberate omissions

**`Select`.** Radix's is a custom listbox. On the Android phones this product is built for,
a native `<select>` opens the OS picker — bigger targets, familiar gestures, accessible
with no work from us, and usable by someone holding a phone in one hand in a queue. That is
the better control here even though it is the less fashionable one. `item-actions.tsx`
keeps native selects on purpose.

**`loading.tsx` anywhere.** See below — this one is a trap, not a preference.

---

## No loading boundaries, and why that is not an oversight

There are no `loading.tsx` files in either app, and adding one will silently break things.

A `loading.tsx` wraps its segment in Suspense, which makes Next **stream** the route. The
response status is sent with the shell, before the page's own code has finished. So:

- `notFound()` can no longer produce a **404** — the 200 has already gone out, and the
  not-found UI arrives as a soft swap. Every "…is a 404, not someone else's page" test in
  the suite goes red, and those assertions are privacy-adjacent: a soft 404 still returns
  200 to a crawler or a cache.
- `redirect()` can no longer produce a **307** — a signed-out visitor gets a shell, a
  skeleton, and only then a client-side navigation to sign-in.

Both were observed, not theorised: adding a single `[locale]/loading.tsx` turned 12 passing
tests red at once (D-101).

The auth half is now handled properly regardless — `middleware.ts` gates `/journeys/*`
before rendering starts, so the redirect is a real 307 and the protected page's server
component never runs for a signed-out visitor. That is UX only; RLS remains the control,
and the in-page `redirect()` stays as defence in depth.

If a skeleton is ever genuinely wanted, put it in a **client** component behind its own
`<Suspense>`, on a leaf route with no `notFound()` in it or below it — never a route-level
`loading.tsx`.

---

## Every view still owes four states

CLAUDE.md §4 is unchanged: loading / empty / error / success.

- **Error** — `app/[locale]/error.tsx` (traveler), `app/(ops)/error.tsx` (operator),
  `app/global-error.tsx` (the root layout itself failed, so no locale, no messages, no
  stylesheet — which is why that one inlines its colours).
- **Not found** — `app/not-found.tsx` **and** `app/[locale]/not-found.tsx`. Two files, and
  the distinction catches people out: a segment's not-found only handles `notFound()`
  called from **inside** that segment. A URL matching no route never enters `[locale]`, so
  it falls through to the root — which emits its own `<html>`, because the root layout
  deliberately does not (the language is only known inside `[locale]`).
- **Empty** — per screen, in the screen. An empty checklist is a real answer, not a
  failure, and says so plainly.
- **Loading** — per component, not per route. See above.

Traveler-facing copy in all of these follows PRD §12.7: never "error", "failed",
"invalid", "URGENT", never an exclamation mark. Ops copy is allowed to be more forthcoming
— an operator is at a desk trying to fix something, and the digest they can quote to
whoever reads the logs is genuinely useful to them.
