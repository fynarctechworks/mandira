import { cn } from "../lib/cn";

type SourceEntry = {
  name: string;
  /** Source tier in words, e.g. "Official temple authority". */
  tierLabel: string;
};

type SourcesFooterProps = {
  sources: SourceEntry[];
  /** Formatted oldest verification date across the page (PRD F9). */
  oldestVerified: string;
  labels?: Partial<{ heading: string; oldestVerified: string }>;
  className?: string;
};

/** PRD 12.5 "Sources & freshness" section footer: bg.surface, caption text, source list. */
export function SourcesFooter({ sources, oldestVerified, labels, className }: SourcesFooterProps) {
  const t = {
    heading: "Sources & freshness",
    oldestVerified: "Oldest confirmation on this page",
    ...labels,
  };

  return (
    <footer
      className={cn("rounded-card border border-border-subtle bg-surface p-4", className)}
      aria-label={t.heading}
    >
      <h2 className="text-body-sm font-medium text-text-primary">{t.heading}</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {sources.map((source) => (
          <li key={source.name} className="text-caption text-text-secondary">
            {source.name} — {source.tierLabel}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-text-secondary">
        {t.oldestVerified}: {oldestVerified}
      </p>
    </footer>
  );
}

export type { SourceEntry, SourcesFooterProps };
