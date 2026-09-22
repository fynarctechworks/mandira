/**
 * The Ops platform's screen map (PRD §5, screens O01–O22).
 *
 * ONE model, rendered by both the sidebar and the command palette, so a screen cannot
 * appear in one and be missing from the other.
 *
 * An entry with `href: null` is a screen delivered somewhere else (O06, D-046) and says
 * where with `comingIn`. Route groups follow FRONTEND_ARCHITECTURE.
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
    href: "/signals",
    keywords: ["analytics", "events", "usage"],
  },

  // ── Knowledge ───────────────────────────────────────────────────────────────
  { id: "O02", label: "Destinations", section: "entities", href: "/destinations" },
  // PRD F19's circuit builder, beside the destinations it orders (OPS-REL-01).
  {
    id: "O02b",
    label: "Circuits",
    section: "entities",
    href: "/circuits",
    keywords: ["circuit", "yatra", "ordered destinations"],
  },
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
  {
    id: "O18",
    label: "Locales",
    section: "entities",
    href: "/locales",
    keywords: ["language", "script", "activate"],
  },
  // O18 is "Locales & phrase packs" in PRD §5; split like O05/O05b because they are separate
  // screens in practice.
  {
    id: "O18b",
    label: "Phrase packs",
    section: "entities",
    href: "/phrases",
    keywords: ["phrase", "audio", "transliteration", "show to someone"],
  },

  // ── Sources ─────────────────────────────────────────────────────────────────
  {
    id: "O08",
    label: "Sources registry",
    section: "sources",
    href: "/sources",
    keywords: ["captures", "diffs", "trust", "tier"],
  },
  {
    id: "O09",
    label: "Ingestion & AI extraction",
    section: "sources",
    href: "/ingestion",
    keywords: ["captures", "diffs", "monitor", "run", "url"],
  },

  // ── Queues ──────────────────────────────────────────────────────────────────
  {
    id: "O10",
    label: "Review queue",
    section: "queues",
    href: "/review",
    keywords: ["change candidates", "excerpt", "accept", "reject"],
  },
  {
    id: "O11",
    label: "Verify queue",
    section: "queues",
    href: "/verify",
    keywords: ["verify", "claim", "evidence", "human reviewed"],
  },
  {
    id: "O12",
    label: "Conflicts",
    section: "queues",
    href: "/conflicts",
    keywords: ["disagree", "winner", "both valid", "escalate"],
  },
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
    href: "/freshness",
    keywords: ["stale", "aging", "expiring", "low confidence", "reverify"],
  },

  // ── Administration ──────────────────────────────────────────────────────────
  {
    id: "O17",
    label: "Translation workspace",
    section: "admin",
    href: "/translations",
    keywords: ["ui strings", "locale completeness", "translate"],
  },
  {
    id: "O19",
    label: "Advisories",
    section: "admin",
    href: "/advisories",
    keywords: ["notice", "severity", "closure"],
  },
  {
    id: "O20",
    label: "Audit log & versions",
    section: "admin",
    href: "/audit",
    keywords: ["history", "restore", "who changed"],
  },
  {
    id: "O21",
    label: "Users, roles & flags",
    section: "admin",
    href: "/team",
    keywords: ["team", "grant", "revoke", "feature flags"],
  },
  /*
   * Not a PRD §5 screen — that list ends at O22. PRD-PRIV-005 needs a consent notice and a
   * named grievance contact, and both are text the company publishes rather than code, so
   * they need somewhere to be published from (0054). Numbered after the PRD's own so the
   * §5 map stays a map of §5.
   */
  {
    id: "O23",
    label: "Legal notices",
    section: "admin",
    href: "/legal",
    keywords: ["dpdp", "consent", "grievance", "privacy", "contact"],
  },
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
