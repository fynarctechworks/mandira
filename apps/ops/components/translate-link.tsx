import Link from "next/link";
import type { TranslatableTable } from "@/lib/content-translations";

/** From an editor to the side-by-side translation of the same entity (O17, OPS-TRANS-02). */
export function TranslateLink({ table, id }: { table: TranslatableTable; id: string }) {
  return (
    <Link
      href={`/translations/${table}/${id}`}
      className="focus-ring text-body-sm font-medium underline"
    >
      Translate
    </Link>
  );
}
