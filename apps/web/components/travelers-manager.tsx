"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@mandhira/ui/components/ui/alert-dialog";
import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@mandhira/ui/components/ui/field";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@mandhira/ui/components/ui/sheet";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { Traveler, TravelerInput } from "../lib/account";

const MOBILITY: TravelerInput["mobility"][] = [
  "full",
  "limited_walking",
  "wheelchair",
  "needs_rest_frequently",
];
const AGE: TravelerInput["ageBand"][] = ["child", "adult", "senior"];

const BLANK: TravelerInput = { label: "", mobility: "full", ageBand: "adult" };

/**
 * The people a traveler journeys with (PRD F13, A23, PRD-PLAN-010).
 *
 * Mobility and age band are the only things the planner reads, so they are the only things
 * asked. Removal is soft and confirmed; the traveler's own profile cannot be removed at all.
 */
export function TravelersManager({ initial }: { initial: Traveler[] }) {
  const t = useTranslations("travelers");
  const router = useRouter();
  const [travelers, setTravelers] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; values: TravelerInput } | null>(null);
  const [removing, setRemoving] = useState<Traveler | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const nameOf = (traveler: Traveler) =>
    traveler.label || (traveler.isSelf ? t("you") : t("unnamed"));

  async function send(url: string, method: string, body?: unknown) {
    setPending(true);
    setProblem(null);

    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setPending(false);

    if (!payload.ok) {
      setProblem(payload.error?.message ?? t("not_saved"));
      return null;
    }
    return payload.data;
  }

  async function save() {
    if (!editing) return;
    const body = { ...editing.values, label: editing.values.label?.trim() || null };

    const data = editing.id
      ? await send(`/api/travelers/${editing.id}`, "PATCH", body)
      : await send("/api/travelers", "POST", body);
    if (!data) return;

    const saved = data.traveler as Traveler;
    setTravelers((current) =>
      editing.id
        ? current.map((traveler) => (traveler.id === saved.id ? saved : traveler))
        : [...current, saved],
    );
    setEditing(null);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    const data = await send(`/api/travelers/${removing.id}`, "DELETE");
    if (!data) return;

    setTravelers((current) => current.filter((traveler) => traveler.id !== removing.id));
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {travelers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {travelers.map((traveler) => (
            <li key={traveler.id} className="flex flex-col gap-2 border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{nameOf(traveler)}</span>
                {traveler.isSelf ? <Badge variant="secondary">{t("you")}</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {t(`mobility_options.${traveler.mobility}`)} ·{" "}
                {t(`age_options.${traveler.ageBand}`)}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 text-sm"
                  aria-label={t("edit_named", { name: nameOf(traveler) })}
                  onClick={() =>
                    setEditing({
                      id: traveler.id,
                      values: {
                        label: traveler.label ?? "",
                        mobility: traveler.mobility,
                        ageBand: traveler.ageBand,
                      },
                    })
                  }
                >
                  {t("edit")}
                </Button>
                {traveler.isSelf ? (
                  <p className="self-center text-xs text-muted-foreground">{t("self_note")}</p>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 text-sm"
                    aria-label={t("remove_named", { name: nameOf(traveler) })}
                    onClick={() => setRemoving(traveler)}
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="min-h-11 gap-2 self-start text-sm"
        onClick={() => setEditing({ id: null, values: BLANK })}
      >
        <Plus className="size-4" aria-hidden />
        {t("add")}
      </Button>

      {problem && !editing && !removing ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      <Sheet open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">{editing?.id ? t("edit") : t("add")}</SheetTitle>
          </SheetHeader>
          {editing ? (
            <form
              className="flex flex-col gap-4 px-4 pb-6"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Field>
                <FieldLabel htmlFor="traveler-label" className="text-sm">
                  {t("label")}
                </FieldLabel>
                <Input
                  id="traveler-label"
                  value={editing.values.label ?? ""}
                  maxLength={60}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: { ...editing.values, label: event.target.value },
                    })
                  }
                  className="h-11 text-sm"
                />
                <FieldDescription>{t("label_hint")}</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="traveler-mobility" className="text-sm">
                  {t("mobility")}
                </FieldLabel>
                <NativeSelect
                  id="traveler-mobility"
                  value={editing.values.mobility}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: {
                        ...editing.values,
                        mobility: event.target.value as TravelerInput["mobility"],
                      },
                    })
                  }
                  className="w-full [&_select]:h-11 [&_select]:text-sm"
                >
                  {MOBILITY.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(`mobility_options.${value}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="traveler-age" className="text-sm">
                  {t("age")}
                </FieldLabel>
                <NativeSelect
                  id="traveler-age"
                  value={editing.values.ageBand}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      values: {
                        ...editing.values,
                        ageBand: event.target.value as TravelerInput["ageBand"],
                      },
                    })
                  }
                  className="w-full [&_select]:h-11 [&_select]:text-sm"
                >
                  {AGE.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(`age_options.${value}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1 text-sm"
                  onClick={() => setEditing(null)}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={pending} className="min-h-11 flex-1 text-sm">
                  {t("save")}
                </Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing ? t("remove_title", { name: nameOf(removing) }) : null}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("remove_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          {problem && removing ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 text-sm">{t("keep")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
              className="min-h-11 text-sm"
            >
              {t("remove")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
