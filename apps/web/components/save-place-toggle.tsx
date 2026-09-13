"use client";

import { cn } from "@mandhira/ui";
import { Button, buttonVariants } from "@mandhira/ui/components/ui/button";
import { Bookmark, BookmarkCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Save or unsave a place (PRD F13, A22).
 *
 * A guest is offered sign-in with a way back to this page rather than a button that refuses.
 * The state flips only once the server agrees, so "Saved" is never shown for something that
 * was not.
 */
export function SavePlaceToggle({
  placeId,
  initialSaved,
  signInHref,
}: {
  placeId: string;
  initialSaved: boolean;
  /** Set when the visitor is signed out. */
  signInHref: string | null;
}) {
  const t = useTranslations("savedPlaces");
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (signInHref) {
    return (
      <Link
        href={signInHref}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "min-h-11 gap-2 self-start px-3 text-sm",
        )}
      >
        <Bookmark className="size-4" aria-hidden />
        {t("sign_in")}
      </Link>
    );
  }

  async function toggle() {
    const next = !saved;
    setPending(true);
    setProblem(null);

    const response = await fetch(
      next ? "/api/saved-places" : `/api/saved-places?placeId=${encodeURIComponent(placeId)}`,
      {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        ...(next ? { body: JSON.stringify({ placeId }) } : {}),
      },
    ).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    if (payload.ok) setSaved(next);
    else setProblem(t("not_saved"));
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={saved ? "secondary" : "outline"}
        disabled={pending}
        onClick={() => void toggle()}
        aria-label={saved ? t("unsave_label") : undefined}
        className="min-h-11 gap-2 self-start px-3 text-sm"
      >
        {saved ? (
          <BookmarkCheck className="size-4" aria-hidden />
        ) : (
          <Bookmark className="size-4" aria-hidden />
        )}
        {saved ? t("saved") : t("save")}
      </Button>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
