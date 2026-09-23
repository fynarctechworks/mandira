import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@mandhira/ui/components/ui/empty";
import type { LucideIcon } from "lucide-react";

/**
 * The empty state for a whole Ops screen — a queue, the media library, the team list.
 *
 * The design review found these as bare paragraphs ("Nothing is scheduled."), which read
 * like something failed to load. An empty queue is the GOOD outcome for most of these
 * screens, and it should look deliberate: a mark, a line that says the state, and a line
 * that says what would fill it — so an operator knows whether "empty" means "all done"
 * or "nothing has been set up yet".
 *
 * Built on the design system's `Empty` rather than beside it. Small empties INSIDE an
 * editor panel ("No stops yet") stay as a line of text: a full empty state there would
 * outweigh the form it sits in.
 */
export function QueueEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  /** What fills this screen, so empty reads as a state rather than a failure. */
  description: string;
}) {
  return (
    <Empty className="rounded-card border border-border-subtle bg-surface">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-body font-medium">{title}</EmptyTitle>
        <EmptyDescription className="text-body-sm text-text-secondary">
          {description}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
