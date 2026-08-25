import { CloudOff } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type OfflineBannerProps = Omit<ComponentProps<"div">, "children"> & {
  /** Full message text, supplied by the caller so strings stay externalised. */
  message: string;
};

/** 36 px, status.info at 12% fill, icon + text (PRD 12.5). */
export function OfflineBanner({ message, className, ...props }: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-9 items-center gap-2 bg-status-info/12 px-4 py-2 text-body-sm text-text-primary",
        className,
      )}
      {...props}
    >
      <CloudOff aria-hidden="true" className="size-4 shrink-0 text-status-info" />
      <span>{message}</span>
    </div>
  );
}

export type { OfflineBannerProps };
