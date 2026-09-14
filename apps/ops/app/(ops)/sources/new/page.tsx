import { EMPTY_SOURCE, SourceForm } from "@/components/source-form";
import { sourceFormOptions } from "@/lib/source-options";
import { opsSupabase } from "@/lib/supabase";

export const metadata = { title: "Register a source · Mandhira Ops" };

export default async function NewSourcePage() {
  const options = await sourceFormOptions(await opsSupabase());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h1">Register a source</h1>
        <p className="mt-1 text-body text-text-secondary">
          Facts are verified against sources. The tier you choose decides how confident travelers
          are told to be.
        </p>
      </header>
      <SourceForm initial={EMPTY_SOURCE} options={options} />
    </div>
  );
}
