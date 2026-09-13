import { HistoryIcon } from "lucide-react";
import Link from "next/link";

/** Link from an editor to its entity's version history (O20). */
export function HistoryLink({ table, id }: { table: string; id: string }) {
  return (
    <Link
      href={`/audit/${table}/${id}`}
      className="focus-ring inline-flex min-h-9 items-center gap-1 text-body-sm underline"
    >
      <HistoryIcon aria-hidden="true" className="size-4" />
      History
    </Link>
  );
}
