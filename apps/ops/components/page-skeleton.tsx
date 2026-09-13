import { Skeleton } from "@mandhira/ui/components/ui/skeleton";
import { Spinner } from "@mandhira/ui/components/ui/spinner";

/** Loading state for an Ops screen: header, a filter row, then rows or tiles. */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "tiles" | "form" }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center gap-2 text-body-sm text-text-secondary">
        <Spinner />
        <span>Loading</span>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      {variant === "tiles" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : null}

      {variant === "form" ? (
        <div className="flex max-w-2xl flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
