import { DestinationForm } from "@/components/destination-form";
import { activeLocales } from "@/lib/locales";

export const metadata = { title: "New destination · Mandhira Ops" };

export default async function NewDestinationPage() {
  const locales = await activeLocales();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">New destination</h1>
        <p className="mt-1 text-body text-text-secondary">
          Saved as a draft — nothing reaches travelers until it is verified and approved.
        </p>
      </header>
      <DestinationForm locales={locales} />
    </div>
  );
}
