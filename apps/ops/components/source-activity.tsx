import { Badge } from "@mandhira/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import Link from "next/link";
import { editorPath, entityNoun, formatWhen } from "@/lib/entities";

export type CaptureRow = {
  id: string;
  captured_at: string;
  content_hash: string | null;
  diff_from_previous: string | null;
  run: { kind: string; status: string } | null;
};

export type CandidateSummary = {
  id: string;
  entity_table: string;
  entity_id: string | null;
  field_name: string | null;
  status: string;
  excerpt: string | null;
  capture_id: string | null;
  created_at: string;
  decision_reason: string | null;
};

const CANDIDATE_STATUS: Record<string, string> = {
  open: "Waiting in Review",
  in_progress: "Sent to Verify",
  done: "Accepted",
  rejected: "Rejected",
};

/** O08's detail half (PRD F17): what was fetched from this source, and what it raised. */
export function SourceActivity({
  captures,
  candidates,
}: {
  captures: CaptureRow[];
  candidates: CandidateSummary[];
}) {
  const raisedBy = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.capture_id)
      raisedBy.set(candidate.capture_id, (raisedBy.get(candidate.capture_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="captures-heading" className="flex flex-col gap-2">
        <h2 id="captures-heading" className="text-h3">
          Captures ({captures.length})
        </h2>
        {captures.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            Nothing has been fetched from this source yet. A source set to watch its page is fetched
            on its re-check cadence, or straight away from{" "}
            <Link href="/ingestion" className="focus-ring underline">
              Ingestion
            </Link>
            .
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">Captures of this source, latest first</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Captured</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Content hash</TableHead>
                <TableHead>Changes from the capture before</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {captures.map((capture) => (
                <TableRow key={capture.id}>
                  <TableCell className="align-top">{formatWhen(capture.captured_at)}</TableCell>
                  <TableCell className="align-top">
                    {capture.run ? `${capture.run.kind} · ${capture.run.status}` : "—"}
                  </TableCell>
                  <TableCell className="align-top font-mono">
                    {capture.content_hash ? capture.content_hash.slice(0, 12) : "—"}
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal align-top">
                    {capture.diff_from_previous ? (
                      <details>
                        <summary className="focus-ring cursor-pointer underline">
                          {capture.diff_from_previous.split("\n").length} changed lines
                        </summary>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-caption">
                          {capture.diff_from_previous}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-text-secondary">First capture, nothing to compare</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {raisedBy.get(capture.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="candidates-heading" className="flex flex-col gap-2">
        <h2 id="candidates-heading" className="text-h3">
          Change candidates ({candidates.length})
        </h2>
        {candidates.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            No change has been detected from this source. That is the healthy state: every field
            verified against it still matches what it says.
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Change candidates raised from this source
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Raised</TableHead>
                <TableHead>About</TableHead>
                <TableHead>Evidence that disappeared</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => {
                const href = editorPath(candidate.entity_table, candidate.entity_id);
                return (
                  <TableRow key={candidate.id}>
                    <TableCell className="align-top">{formatWhen(candidate.created_at)}</TableCell>
                    <TableCell className="align-top">
                      {href ? (
                        <Link href={href} className="focus-ring underline">
                          {entityNoun(candidate.entity_table)}
                        </Link>
                      ) : (
                        entityNoun(candidate.entity_table)
                      )}
                      {candidate.field_name ? (
                        <span className="block font-mono text-caption text-text-secondary">
                          {candidate.field_name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal align-top text-text-secondary">
                      {candidate.excerpt ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top">
                      {candidate.status === "open" ? (
                        <Link href="/review" className="focus-ring underline">
                          {CANDIDATE_STATUS.open}
                        </Link>
                      ) : (
                        <Badge variant="outline">
                          {CANDIDATE_STATUS[candidate.status] ?? candidate.status}
                        </Badge>
                      )}
                      {candidate.decision_reason ? (
                        <span className="mt-0.5 block text-caption text-text-secondary">
                          {candidate.decision_reason}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
