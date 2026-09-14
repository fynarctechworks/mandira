"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { Switch } from "@mandhira/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addLocale, setLocaleActive, updateLocale } from "@/app/(ops)/locales/actions";

export type LocaleRow = {
  code: string;
  name_native: string;
  name_en: string;
  script: string;
  transliteration_scheme: string | null;
  is_active: boolean;
  sort_order: number;
};

type Draft = Omit<LocaleRow, "is_active">;

const BLANK: Draft = {
  code: "",
  name_native: "",
  name_en: "",
  script: "",
  transliteration_scheme: null,
  sort_order: 100,
};

type Outcome =
  { ok: true } | { ok: false; error: { message: string; fieldErrors?: Record<string, string[]> } };

/** O18: every locale, switched on or off, reordered and renamed; adding one is a row. */
export function LocalesAdmin({ locales, canEdit }: { locales: LocaleRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<Draft>(BLANK);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function act(run: () => Promise<Outcome>, done: string, after?: () => void) {
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      after?.();
      setMessage(done);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      <Table>
        <TableCaption className="sr-only">Locales, in the order they are offered</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Script</TableHead>
            <TableHead>Transliteration</TableHead>
            <TableHead className="text-right">Order</TableHead>
            <TableHead>Offered</TableHead>
            {canEdit ? (
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {locales.map((locale) =>
            editing?.code === locale.code ? (
              <TableRow key={locale.code}>
                <TableCell className="font-mono">{locale.code}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label="Name in its own script"
                      value={editing.name_native}
                      lang={locale.code}
                      onChange={(e) => setEditing({ ...editing, name_native: e.target.value })}
                    />
                    <Input
                      aria-label="English name"
                      value={editing.name_en}
                      onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label="Script"
                    className="w-20"
                    value={editing.script}
                    onChange={(e) => setEditing({ ...editing, script: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label="Transliteration scheme"
                    value={editing.transliteration_scheme ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, transliteration_scheme: e.target.value || null })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label="Sort order"
                    type="number"
                    className="w-20 text-right"
                    value={editing.sort_order}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  />
                </TableCell>
                <TableCell>{locale.is_active ? "On" : "Off"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        act(
                          () => updateLocale(editing),
                          `${locale.name_en} is saved.`,
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={locale.code}>
                <TableCell className="font-mono">{locale.code}</TableCell>
                <TableCell>
                  <span lang={locale.code}>{locale.name_native}</span>
                  <span className="block text-caption text-text-secondary">{locale.name_en}</span>
                </TableCell>
                <TableCell className="font-mono">{locale.script}</TableCell>
                <TableCell>{locale.transliteration_scheme ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{locale.sort_order}</TableCell>
                <TableCell>
                  <label className="flex items-center gap-2">
                    <Switch
                      aria-label={`Offer ${locale.name_en} to travelers`}
                      checked={locale.is_active}
                      disabled={!canEdit || pending}
                      onCheckedChange={(checked) =>
                        act(
                          () => setLocaleActive({ code: locale.code, is_active: checked }),
                          `${locale.name_en} is ${checked ? "offered" : "no longer offered"}.`,
                        )
                      }
                    />
                    <span>{locale.is_active ? "On" : "Off"}</span>
                  </label>
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${locale.name_en}`}
                      onClick={() =>
                        setEditing({
                          code: locale.code,
                          name_native: locale.name_native,
                          name_en: locale.name_en,
                          script: locale.script,
                          transliteration_scheme: locale.transliteration_scheme,
                          sort_order: locale.sort_order,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>

      {canEdit ? (
        <form
          aria-labelledby="add-locale-heading"
          className="flex max-w-3xl flex-col gap-3 border border-border-subtle bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            act(
              () => addLocale({ ...adding, is_active: false }),
              `${adding.name_en} is added, switched off until its content is ready.`,
              () => setAdding(BLANK),
            );
          }}
        >
          <h2 id="add-locale-heading" className="text-h3">
            Add a locale
          </h2>
          <p className="text-body-sm text-text-secondary">
            Added switched off, so travelers are not offered a language with nothing in it yet.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code" id="locale-code" hint="e.g. ta, mr, en-IN">
              <Input
                id="locale-code"
                required
                value={adding.code}
                onChange={(e) => setAdding({ ...adding, code: e.target.value })}
              />
            </Field>
            <Field label="Name in its own script" id="locale-native">
              <Input
                id="locale-native"
                required
                value={adding.name_native}
                onChange={(e) => setAdding({ ...adding, name_native: e.target.value })}
              />
            </Field>
            <Field label="English name" id="locale-en">
              <Input
                id="locale-en"
                required
                value={adding.name_en}
                onChange={(e) => setAdding({ ...adding, name_en: e.target.value })}
              />
            </Field>
            <Field label="Script" id="locale-script" hint="ISO 15924, e.g. Taml">
              <Input
                id="locale-script"
                required
                value={adding.script}
                onChange={(e) => setAdding({ ...adding, script: e.target.value })}
              />
            </Field>
            <Field
              label="Transliteration scheme"
              id="locale-translit"
              hint="Optional, e.g. ISO 15919"
            >
              <Input
                id="locale-translit"
                value={adding.transliteration_scheme ?? ""}
                onChange={(e) =>
                  setAdding({ ...adding, transliteration_scheme: e.target.value || null })
                }
              />
            </Field>
            <Field label="Order" id="locale-order">
              <Input
                id="locale-order"
                type="number"
                min={0}
                value={adding.sort_order}
                onChange={(e) => setAdding({ ...adding, sort_order: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              Add locale
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <span className="text-caption text-text-secondary">{hint}</span> : null}
    </div>
  );
}
