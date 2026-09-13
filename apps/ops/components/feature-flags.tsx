"use client";

import { Button } from "@mandhira/ui/components/ui/button";
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
import { Textarea } from "@mandhira/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { describeFeatureFlag, setFeatureFlag } from "@/app/(ops)/team/actions";

export type FlagRow = {
  key: string;
  is_enabled: boolean;
  destination_ids: string[] | null;
  description: string | null;
};

/** O21's flags half: each flag on or off, with a description of what it controls. */
export function FeatureFlags({ flags }: { flags: FlagRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function act(
    run: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>,
    done: string,
  ) {
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setEditing(null);
      setMessage(done);
      router.refresh();
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
        <TableCaption className="sr-only">Feature flags</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Flag</TableHead>
            <TableHead>What it controls</TableHead>
            <TableHead>Applies to</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <TableRow key={flag.key}>
              <TableCell className="align-top font-mono">{flag.key}</TableCell>
              <TableCell className="min-w-72 whitespace-normal align-top">
                {editing === flag.key ? (
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`flag-${flag.key}`} className="sr-only">
                      Description of {flag.key}
                    </label>
                    <Textarea
                      id={`flag-${flag.key}`}
                      value={draft}
                      maxLength={500}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          act(
                            () => describeFeatureFlag({ key: flag.key, description: draft }),
                            `The description of ${flag.key} is saved.`,
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span className={flag.description ? undefined : "text-text-tertiary"}>
                      {flag.description ?? "No description yet"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit the description of ${flag.key}`}
                      onClick={() => {
                        setDraft(flag.description ?? "");
                        setEditing(flag.key);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </TableCell>
              <TableCell className="align-top">
                {flag.destination_ids && flag.destination_ids.length > 0
                  ? `${flag.destination_ids.length} ${flag.destination_ids.length === 1 ? "destination" : "destinations"}`
                  : "Everywhere"}
              </TableCell>
              <TableCell className="align-top">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={flag.is_enabled}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      act(
                        () => setFeatureFlag({ key: flag.key, is_enabled: checked }),
                        `${flag.key} is ${checked ? "on" : "off"}.`,
                      )
                    }
                  />
                  <span>{flag.is_enabled ? "On" : "Off"}</span>
                  <span className="sr-only"> — {flag.key}</span>
                </label>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
