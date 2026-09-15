import { CircuitForm } from "@/components/circuit-form";
import { activeLocales } from "@/lib/locales";

export const metadata = { title: "New circuit · Mandhira Ops" };

export default async function NewCircuitPage() {
  const locales = await activeLocales();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New circuit</h1>
        <p className="mt-1 text-body text-text-secondary">
          Name it first. You add its destinations, in order, once it is created.
        </p>
      </header>
      <CircuitForm locales={locales} />
    </div>
  );
}
