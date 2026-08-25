import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";

type NowCardAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "tertiary";
};

type NowCardProps = {
  /** Small label above the title, e.g. "Now". */
  eyebrow?: string;
  title: string;
  detail?: string;
  /** PRD 12.5 caps this at three actions in a row. */
  actions?: NowCardAction[];
  trailing?: ReactNode;
  className?: string;
};

/** PRD 12.5 NOW card: raised, 24 px padding, title 22/600, up to 3 actions in a row. */
export function NowCard({
  eyebrow,
  title,
  detail,
  actions = [],
  trailing,
  className,
}: NowCardProps) {
  const shownActions = actions.slice(0, 3);

  return (
    <section
      className={cn("rounded-card bg-surface-raised p-6 shadow-raised", className)}
      aria-label={eyebrow ?? title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-caption font-medium tracking-[0.06em] text-text-secondary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-h2">{title}</h2>
          {detail ? <p className="mt-1 text-body text-text-secondary">{detail}</p> : null}
        </div>
        {trailing}
      </div>

      {shownActions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {shownActions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "secondary"}
              className="flex-1"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export type { NowCardAction, NowCardProps };
