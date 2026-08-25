"use client";

import { createBrowserSupabase } from "@mandhira/db/client/browser";
import { Button } from "@mandhira/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveMedia, registerMedia } from "@/app/(ops)/media/actions";

export type MediaRow = {
  id: string;
  storage_path: string;
  media_type: string;
  caption_i18n: Record<string, string>;
  credit: string | null;
  licence: string | null;
  width: number | null;
  height: number | null;
};

/**
 * Media library (O16, OPS-MEDIA-01).
 *
 * The licence field is required before upload, not after. PRD F18 blocks publication of
 * any entity whose media lacks one, and asking at upload time is the only moment the
 * person actually knows the answer.
 */
export function MediaLibrary({
  items,
  publicBaseUrl,
}: {
  items: MediaRow[];
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [licence, setLicence] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    if (licence.trim() === "") {
      setProblem("Add the licence before uploading — unlicensed media cannot be published.");
      return;
    }

    setBusy(true);
    setProblem(null);

    const supabase = createBrowserSupabase();
    // Path is prefixed with a random id so two files of the same name never collide.
    const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.-]/g, "_")}`;

    const { error: uploadError } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      setBusy(false);
      setProblem("That file didn't upload. Check the size and format, then try again.");
      return;
    }

    const kind = file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : "image";

    const result = await registerMedia({
      storage_path: path,
      media_type: kind,
      caption_i18n: {},
      credit: credit || null,
      licence,
    });

    setBusy(false);
    if (!result.ok) {
      setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }

    setFile(null);
    setLicence("");
    setCredit("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex max-w-2xl flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4">
        <h2 className="text-h3">Add media</h2>

        {/* Associated by id, not wrapped: a <label> wrapping the input pulls the hint text
            into its accessible name ("File Up to 5 MB. Sizes for…"), which a screen reader
            then reads out as the field's name. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="media-file" className="text-body-sm font-medium">
            File
          </label>
          <input
            id="media-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,audio/mpeg,audio/ogg"
            aria-describedby="media-file-hint"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 py-2 text-body"
          />
          <span id="media-file-hint" className="text-caption text-text-secondary">
            Up to 5 MB. Sizes for different screens are produced on delivery, so upload the
            original.
          </span>
        </div>

        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Licence
          <input
            value={licence}
            onChange={(e) => setLicence(e.target.value)}
            required
            placeholder="e.g. CC BY 4.0, or Licensed from the temple trust"
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
          <span className="text-caption font-normal text-text-secondary">
            Required. Anything attached to published content must carry one.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Credit
          <input
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          />
        </label>

        {problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}

        <div>
          <Button type="button" loading={busy} disabled={!file} onClick={() => void upload()}>
            Upload
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-h3">Library ({items.length})</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-body-sm text-text-secondary">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface p-2"
              >
                {item.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Ops-only thumbnail; next/image adds no value behind auth
                  <img
                    src={`${publicBaseUrl}/${item.storage_path}`}
                    alt={item.caption_i18n["en"] ?? "Uploaded media"}
                    className="aspect-square w-full rounded-[8px] object-cover"
                  />
                ) : (
                  <p className="text-body-sm">{item.media_type}</p>
                )}
                <p className="truncate text-caption text-text-secondary">
                  {item.licence ? (
                    <span className="text-status-comfortable">● {item.licence}</span>
                  ) : (
                    <span className="text-status-tight">○ No licence</span>
                  )}
                </p>
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={async () => {
                    await archiveMedia({ id: item.id });
                    router.refresh();
                  }}
                >
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
