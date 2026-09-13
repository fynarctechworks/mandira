import { getOpsRoles, hasAnyRole } from "@mandhira/db/client/roles";
import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@mandhira/ui/components/ui/pagination";
import { Progress } from "@mandhira/ui/components/ui/progress";
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
import { LoadProblem } from "@/components/load-problem";
import { TranslationsGrid } from "@/components/translations-grid";
import { percent, type KnowledgeHealth } from "@/lib/health";
import { activeLocales } from "@/lib/locales";
import { opsSupabase } from "@/lib/supabase";
import {
  TRANSLATION_PAGE_SIZE,
  filterPivot,
  localeProgress,
  pivotStrings,
  type UiStringRow,
} from "@/lib/translations";

export const metadata = { title: "Translations · Mandhira Ops" };
export const dynamic = "force-dynamic";

/**
 * O17 — the Translation workspace (PRD F19, PRD-OPS-CNT-004).
 *
 * Interface copy by key, a column per active locale, edited in place by translators; and
 * how much published content carries a name in each locale, with a way into it.
 */
export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; missing?: string; page?: string }>;
}) {
  const query = await searchParams;
  const supabase = await opsSupabase();

  const [roles, locales, strings, health] = await Promise.all([
    getOpsRoles(supabase),
    activeLocales(),
    supabase.from("ui_strings").select("key, locale, value, status").order("key").limit(10_000),
    supabase.rpc("knowledge_health"),
  ]);

  const codes = locales.map((locale) => locale.code);
  const missing = codes.includes(query.missing ?? "") ? (query.missing as string) : null;
  const q = (query.q ?? "").slice(0, 100);
  const pivot = pivotStrings((strings.data ?? []) as UiStringRow[], codes);
  const filtered = filterPivot(pivot, { q, missing });
  const pages = Math.max(1, Math.ceil(filtered.length / TRANSLATION_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1), pages);
  const visible = filtered.slice((page - 1) * TRANSLATION_PAGE_SIZE, page * TRANSLATION_PAGE_SIZE);
  const progress = localeProgress(pivot, codes);
  const labelFor = (code: string) => locales.find((locale) => locale.code === code)?.label ?? code;

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (missing) params.set("missing", missing);
    if (target > 1) params.set("page", String(target));
    const text = params.toString();
    return `/translations${text ? `?${text}` : ""}`;
  };

  const content = health.data ? (health.data as unknown as KnowledgeHealth).locales : [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">Translations</h1>
        <p className="text-body text-text-secondary">
          The traveler app&apos;s interface copy in every active language, and how much published
          content is named in each. Only a confirmed translation counts as done.
        </p>
        {!hasAnyRole(roles, ["translator", "admin"]) ? (
          <p className="text-body-sm text-text-secondary">
            Editing needs the translator role. You can read everything here.
          </p>
        ) : null}
      </header>

      <section aria-labelledby="content-heading" className="flex flex-col gap-3">
        <h2 id="content-heading" className="text-h3">
          Content by locale
        </h2>
        {health.error ? (
          <LoadProblem />
        ) : (
          <Table>
            <TableCaption className="sr-only">Published content named in each locale</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Locale</TableHead>
                <TableHead className="text-right">Named</TableHead>
                <TableHead className="w-1/3">Coverage</TableHead>
                <TableHead>Work on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {content.map((locale) => {
                const share = percent(locale.translated, locale.published);
                return (
                  <TableRow key={locale.code}>
                    <TableCell>
                      {locale.name} <span className="text-text-tertiary">{locale.code}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {locale.translated} of {locale.published}
                    </TableCell>
                    <TableCell>
                      <Progress
                        value={share}
                        aria-label={`${locale.name} content coverage ${share}%`}
                      />
                    </TableCell>
                    <TableCell className="flex gap-3">
                      <Link href="/destinations" className="focus-ring underline">
                        Destinations
                      </Link>
                      <Link href="/places" className="focus-ring underline">
                        Places
                      </Link>
                      <Link href="/experiences" className="focus-ring underline">
                        Experiences
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="strings-heading" className="flex flex-col gap-3">
        <h2 id="strings-heading" className="text-h3">
          Interface strings
        </h2>

        {strings.error ? (
          <LoadProblem />
        ) : pivot.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No interface strings are stored yet.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-4 text-body-sm">
              {progress.map((item) => (
                <li key={item.code}>
                  <span className="font-medium">{labelFor(item.code)}</span>{" "}
                  <span className="text-text-secondary">
                    {item.confirmed} confirmed · {item.drafts} drafts · {item.missing} missing
                  </span>
                </li>
              ))}
            </ul>

            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="strings-q" className="text-body-sm font-medium">
                  Search
                </label>
                <Input
                  id="strings-q"
                  name="q"
                  defaultValue={q}
                  placeholder="Key or text"
                  className="w-64"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="strings-missing" className="text-body-sm font-medium">
                  Not yet confirmed in
                </label>
                <NativeSelect id="strings-missing" name="missing" defaultValue={missing ?? ""}>
                  <NativeSelectOption value="">Any locale</NativeSelectOption>
                  {locales.map((locale) => (
                    <NativeSelectOption key={locale.code} value={locale.code}>
                      {locale.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit" variant="outline">
                Apply
              </Button>
            </form>

            {visible.length === 0 ? (
              <p className="text-body-sm text-text-secondary">Nothing matches that.</p>
            ) : (
              <>
                <p className="text-caption text-text-secondary">
                  {filtered.length} {filtered.length === 1 ? "key" : "keys"} · page {page} of{" "}
                  {pages}
                </p>
                <TranslationsGrid
                  rows={visible}
                  locales={locales}
                  canEdit={hasAnyRole(roles, ["translator", "admin"])}
                />
                {pages > 1 ? (
                  <Pagination>
                    <PaginationContent>
                      {page > 1 ? (
                        <PaginationItem>
                          <PaginationPrevious href={pageHref(page - 1)} />
                        </PaginationItem>
                      ) : null}
                      {page < pages ? (
                        <PaginationItem>
                          <PaginationNext href={pageHref(page + 1)} />
                        </PaginationItem>
                      ) : null}
                    </PaginationContent>
                  </Pagination>
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
