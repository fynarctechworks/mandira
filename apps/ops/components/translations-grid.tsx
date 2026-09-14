"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { Textarea } from "@mandhira/ui/components/ui/textarea";
import { BotIcon, CircleCheckIcon, CircleDashedIcon, PencilLineIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveUiString, suggestUiString } from "@/app/(ops)/translations/actions";
import type { PivotRow } from "@/lib/translations";

const STATUS = {
  confirmed: { label: "Confirmed", Icon: CircleCheckIcon, variant: "outline" },
  draft: { label: "Draft", Icon: PencilLineIcon, variant: "secondary" },
  ai_draft: { label: "AI draft", Icon: BotIcon, variant: "secondary" },
} as const;

type Editing = { key: string; locale: string; value: string; status: "draft" | "confirmed" };

/** O17's grid: a row per key, a column per active locale, each cell editable in place. */
export function TranslationsGrid({
  rows,
  locales,
  canEdit,
}: {
  rows: PivotRow[];
  locales: { code: string; label: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    if (!editing) return;
    const current = editing;
    setProblem(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveUiString(current);
      if (!result.ok) {
        setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      setEditing(null);
      setMessage(`${current.key} (${current.locale}) is saved as ${current.status}.`);
      router.refresh();
    });
  }

  function suggest() {
    if (!editing) return;
    const current = editing;
    setProblem(null);
    setMessage(null);
    startTransition(async () => {
      const result = await suggestUiString({ key: current.key, locale: current.locale });
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setEditing({ ...current, value: result.data.value, status: "draft" });
      setMessage("Suggestion added. Check it, then save it as a draft or confirm it.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      <Table>
        <TableCaption className="sr-only">Interface strings by key and locale</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            {locales.map((locale) => (
              <TableHead key={locale.code}>{locale.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="align-top font-mono">{row.key}</TableCell>
              {locales.map((locale) => {
                const cell = row.cells[locale.code] ?? null;
                const isEditing = editing?.key === row.key && editing.locale === locale.code;
                const status = cell ? STATUS[cell.status as keyof typeof STATUS] : null;

                return (
                  <TableCell
                    key={locale.code}
                    className="min-w-56 max-w-80 whitespace-normal align-top"
                  >
                    {isEditing && editing ? (
                      <div className="flex flex-col gap-2">
                        <label htmlFor={`cell-${row.key}-${locale.code}`} className="sr-only">
                          {row.key} in {locale.label}
                        </label>
                        <Textarea
                          id={`cell-${row.key}-${locale.code}`}
                          lang={locale.code}
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <NativeSelect
                            aria-label="Status"
                            value={editing.status}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                status: e.target.value as Editing["status"],
                              })
                            }
                          >
                            <NativeSelectOption value="draft">Draft</NativeSelectOption>
                            <NativeSelectOption value="confirmed">Confirmed</NativeSelectOption>
                          </NativeSelect>
                          {locale.code !== "en" ? (
                            <Button variant="outline" disabled={pending} onClick={suggest}>
                              <BotIcon aria-hidden="true" />
                              Suggest
                            </Button>
                          ) : null}
                          <Button disabled={pending} onClick={save}>
                            Save
                          </Button>
                          <Button variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        {cell ? (
                          <span lang={locale.code} className="line-clamp-3">
                            {cell.value}
                          </span>
                        ) : null}
                        <div className="flex items-center gap-1">
                          {status ? (
                            <Badge variant={status.variant}>
                              <status.Icon aria-hidden="true" />
                              {status.label}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <CircleDashedIcon aria-hidden="true" />
                              Missing
                            </Badge>
                          )}
                          {canEdit ? (
                            <Button
                              variant="ghost"
                              aria-label={`Edit ${row.key} in ${locale.label}`}
                              onClick={() =>
                                setEditing({
                                  key: row.key,
                                  locale: locale.code,
                                  value: cell?.value ?? "",
                                  status: cell?.status === "confirmed" ? "confirmed" : "draft",
                                })
                              }
                            >
                              Edit
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
