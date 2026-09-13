"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Move an item earlier or later in its day (PRD F4, TRD `POST /api/journeys/:id/reorder`).
 *
 * Buttons rather than drag-and-drop: each move is one explicit tap with a name a screen reader
 * can say, and it works at 200% text size on a small phone, where dragging does not.
 */
export function ReorderButtons({
  journeyId,
  dayIndex,
  orderedIds,
  index,
  name,
}: {
  journeyId: string;
  dayIndex: number;
  orderedIds: string[];
  index: number;
  name: string;
}) {
  const t = useTranslations("reorder");
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function move(by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= orderedIds.length) return;

    const next = [...orderedIds];
    [next[index], next[target]] = [next[target]!, next[index]!];

    setPending(true);
    setProblem(null);

    const response = await fetch(`/api/journeys/${journeyId}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dayIndex, orderedItemIds: next }),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setPending(false);

    if (!payload.ok) {
      setProblem(payload.error?.message ?? t("not_moved"));
      return;
    }
    startTransition(() => router.refresh());
  }

  const busy = pending || refreshing;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          disabled={busy || index === 0}
          onClick={() => void move(-1)}
          aria-label={t("earlier", { name })}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-11"
          disabled={busy || index === orderedIds.length - 1}
          onClick={() => void move(1)}
          aria-label={t("later", { name })}
        >
          <ArrowDown aria-hidden />
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
