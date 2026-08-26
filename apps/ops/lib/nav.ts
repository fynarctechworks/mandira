/**
 * The Ops platform's screen map (PRD §5, screens O01–O22).
 *
 * ONE model, rendered by both the sidebar and the command palette, so a screen cannot
 * appear in one and be missing from the other.
 *
 * Screens that do not exist yet are listed with `href: null` and the milestone that
 * brings them. Showing the whole map is deliberate: an operator learning the platform
 * benefits from seeing where things will live, and it keeps the backlog honest about what
 * is genuinely built. Route groups follow FRONTEND_ARCHITECTURE.
 */

export type NavSection = "dashboards" | "entities" | "sources" | "queues" | "admin";

export type NavItem = {
  /** Screen id from PRD §5 — kept so nav, docs and the backlog can be cross-read. */
  id: string;
  label: string;
  section: NavSection;
  /** null until the screen is built. */
  href: string | null;
  /** Which milestone/backlog item delivers it. Shown on disabled entries. */
  comingIn?: string;
  /** Extra words the command palette should match on. */
  keywords?: string[];
};

export const NAV_SECTIONS: { id: NavSection; label: string }[] = [
  { id: "dashboards", label: "Overview" },
  { id: "entities", label: "Knowledge" },
  { id: "sources", label: "Sources" },
  { id: "queues", label: "Queues" },
  { id: "admin", label: "Administration" },
];

export const NAV_ITEMS: NavItem[] = [
  // ── Overview ────────────────────────────────────────────────────────────────
  {
    id: "O01",
    label: "Home",
    section: "dashboards",
    href: "/",
    keywords: ["dashboard", "knowledge health"],
  },
  {
    id: "O22",
    label: "Product signals",
    section: "dashboards",
    href: null,
    comingIn: "M4",
    keywords: ["analytics"],
  },

  // ── Knowledge ───────────────────────────────────────────────────────────────
  { id: "O02", label: "Destinations", section: "entities", href: "/destinations" },
  {
    id: "O03",
    label: "Places",
    section: "entities",
    href: "/places",
    keywords: ["temple", "ghat", "facility"],
  },
  {
    id: "O04",
    label: "Experiences",
    section: "entities",
    href: "/experiences",
    keywords: ["darshan", "aarti", "availability"],
  },
  { id: "O05", label: "Routes", section: "entities", href: "/routes" },
  { id: "O05b", label: "Transport", section: "entities", href: "/transport" },
  {
    id: "O06",
    label: "Facilities & accessibility",
    section: "entities",
    // Accessibility records attach to exactly one place or route and have no independent
    // existence, and a facility IS a place. So O06 is delivered as panels on those two
    // screens rather than a screen of its own (D-046) — the label says where to find it
    // rather than pretending it is unbuilt.
    href: null,
    comingIn: "In Places & Routes",
  },
  { id: "O07", label: "Guidance blocks", section: "entities", href: "/guidance" },
  { id: "O16", label: "Media library", section: "entities", href: "/media" },
  { id: "O18", label: "Locales & phrase packs", section: "entities", href: null, comingIn: "M4" },

  // ── Sources ─────────────────────────────────────────────────────────────────
  {
    id: "O08",
    label: "Sources registry",
    section: "sources",
    href: "/sources",
    keywords: ["captures", "diffs", "trust", "tier"],
  },
  { id: "O09", label: "Ingestion & AI extraction", section: "sources", href: null, comingIn: "M3" },

  // ── Queues ──────────────────────────────────────────────────────────────────
  { id: "O10", label: "Review queue", section: "queues", href: null, comingIn: "M3" },
  { id: "O11", label: "Verify queue", section: "queues", href: null, comingIn: "B-012" },
  { id: "O12", label: "Conflicts", section: "queues", href: null, comingIn: "M3" },
  {
    id: "O13",
    label: "Approve & publish",
    section: "queues",
    href: "/publish",
    keywords: ["diff", "validation"],
  },
  { id: "O14", label: "Reports queue", section: "queues", href: "/reports" },
  {
    id: "O15",
    label: "Freshness monitor",
    section: "queues",
    href: null,
    comingIn: "M3",
    keywords: ["stale", "aging"],
  },

  // ── Administration ──────────────────────────────────────────────────────────
  { id: "O17", label: "Translation workspace", section: "admin", href: null, comingIn: "M4" },
  { id: "O19", label: "Advisories", section: "admin", href: null, comingIn: "M4" },
  { id: "O20", label: "Audit log & versions", section: "admin", href: null, comingIn: "M4" },
  { id: "O21", label: "Users, roles & flags", section: "admin", href: null, comingIn: "M4" },
];

/** A screen that has actually been built, so `href` is guaranteed present. */
export type AvailableNavItem = NavItem & { href: string };

/** Screens an operator can actually open today. */
export function availableNavItems(): AvailableNavItem[] {
  return NAV_ITEMS.filter((item): item is AvailableNavItem => item.href !== null);
}

export function navItemsBySection(section: NavSection): NavItem[] {
  return NAV_ITEMS.filter((item) => item.section === section);
}
