"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS, NAV_SECTIONS } from "@/lib/nav";

/**
 * Command palette over the same nav model the sidebar uses, so the two cannot disagree.
 *
 * Unbuilt screens are listed but not selectable, and say which milestone brings them —
 * searching for "conflicts" and finding nothing would be worse than finding it and
 * learning it arrives in M3.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search Ops screens"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-card bg-surface-raised shadow-raised">
        <Command.Input
          autoFocus
          placeholder="Go to…"
          className="w-full border-b border-border-subtle bg-transparent px-4 py-3 text-body outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-body-sm text-text-secondary">
            Nothing matches that.
          </Command.Empty>

          {NAV_SECTIONS.map((section) => {
            const items = NAV_ITEMS.filter((i) => i.section === section.id);
            if (items.length === 0) return null;

            return (
              <Command.Group
                key={section.id}
                heading={section.label}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-text-tertiary"
              >
                {items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.id} ${(item.keywords ?? []).join(" ")}`}
                    disabled={item.href === null}
                    onSelect={() => {
                      if (item.href === null) return;
                      setOpen(false);
                      router.push(item.href);
                    }}
                    className="flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-button px-3 text-body-sm data-[disabled=true]:cursor-default data-[selected=true]:bg-brand-primary-soft data-[disabled=true]:text-text-tertiary"
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="shrink-0 text-caption text-text-tertiary">
                      {item.href === null ? item.comingIn : item.id}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
