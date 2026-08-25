import { cn } from "@mandhira/ui";

/**
 * Inline publish-status tag for Ops tables (PRD §12.5 "inline status tags").
 *
 * Icon + word, never colour alone (PRD §12.8) — the same rule the traveler-facing status
 * components follow, because an operator scanning a list is exactly who benefits from it.
 */
const STATUS: Record<string, { label: string; mark: string; className: string }> = {
  draft: { label: "Draft", mark: "○", className: "text-text-secondary" },
  in_review: { label: "In review", mark: "◐", className: "text-status-tight" },
  published: { label: "Published", mark: "●", className: "text-status-comfortable" },
  archived: { label: "Archived", mark: "▪", className: "text-text-tertiary" },
};

export function PublishStatusTag({ status }: { status: string }) {
  const config = STATUS[status] ?? {
    label: status,
    mark: "•",
    className: "text-text-secondary",
  };

  return (
    <span className={cn("inline-flex items-center gap-1", config.className)}>
      <span aria-hidden="true">{config.mark}</span>
      {config.label}
    </span>
  );
}
