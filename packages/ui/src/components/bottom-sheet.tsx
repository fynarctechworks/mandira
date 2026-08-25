"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "../lib/cn";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: sheets are dialogs and must be named for screen readers. */
  title: string;
  description?: string;
  /** Hide the title visually while keeping it available to assistive tech. */
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * PRD 12.5 bottom sheet: 24 px top radius, drag handle, max 90% height.
 * vaul handles focus trap, scroll lock and focus restore.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-sheet bg-surface-raised shadow-raised outline-none",
            className,
          )}
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-chip bg-border-subtle"
          />
          <div className="overflow-y-auto px-4 pt-4 pb-8">
            <Drawer.Title className={cn("text-h3", hideTitle && "sr-only")}>{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-body-sm text-text-secondary">
                {description}
              </Drawer.Description>
            ) : (
              // Radix warns when a dialog has no description; opt out explicitly.
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
            <div className="mt-4">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export type { BottomSheetProps };
