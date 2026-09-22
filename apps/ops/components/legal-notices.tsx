"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveLegalNotice } from "@/app/(ops)/legal/actions";

export type LegalNoticeRow = {
  key: string;
  body_i18n: Record<string, string> | null;
  updated_at: string;
};

/** What each key is, in the words of somebody who has to write it. */
const NOTICES: Record<string, { title: string; why: string; blocking: boolean }> = {
  consent_notice: {
    title: "What you are agreeing to",
    why: "Shown on the sign-in screen, before an account exists. Say what Mandhira keeps, why, and for how long — in plain words, not a policy summary.",
    blocking: true,
  },
  grievance_contact: {
    title: "Who to contact",
    why: "The DPDP Act requires a named person and a way to reach them. A role and an address, not a form link.",
    blocking: true,
  },
  privacy_policy: {
    title: "Privacy policy",
    why: "The full policy. Optional at launch, and travelers see the section only once it has something in it.",
    blocking: false,
  },
};

/**
 * O23 (PRD-PRIV-005). One box per notice per language, saved on its own.
 *
 * The state a reader most needs is "is this published", so each language says so beside
 * its box, and the two launch-blocking notices say what an empty box means: no accounts.
 */
export function LegalNotices({
  notices,
  locales,
  canEdit,
}: {
  notices: LegalNoticeRow[];
  locales: { code: string; name_en: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const draftKey = (key: string, locale: string) => `${key}:${locale}`;

  function save(key: string, locale: string, body: string) {
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await saveLegalNotice({ key, locale, body });
      if (!result.ok) {
        setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      setMessage(
        result.data.published
          ? `${NOTICES[key]?.title ?? key} published in ${locale}.`
          : `${NOTICES[key]?.title ?? key} taken down in ${locale}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {message ? (
        <p role="status" className="text-body-sm text-status-comfortable">
          {message}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {problem}
        </p>
      ) : null}

      {notices.map((notice) => {
        const meta = NOTICES[notice.key];
        const published = Object.entries(notice.body_i18n ?? {}).filter(([, v]) => v?.trim());

        return (
          <section
            key={notice.key}
            aria-label={meta?.title ?? notice.key}
            className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface p-4"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-h3">{meta?.title ?? notice.key}</h2>
              <p className="max-w-prose text-body-sm text-text-secondary">{meta?.why}</p>
              {meta?.blocking && published.length === 0 ? (
                <p className="rounded-card bg-status-tight/12 p-2 text-caption text-text-primary">
                  ○ Not published — while this is empty, nobody can create an account.
                </p>
              ) : (
                <p className="text-caption text-text-secondary">
                  ● Published in{" "}
                  {published.length === 0 ? "no language" : published.map(([c]) => c).join(", ")}
                </p>
              )}
            </div>

            {locales.map((locale) => {
              const id = draftKey(notice.key, locale.code);
              const saved = notice.body_i18n?.[locale.code] ?? "";
              const value = drafts[id] ?? saved;

              return (
                <div key={locale.code} className="flex flex-col gap-2">
                  <label htmlFor={id} className="text-body-sm font-medium">
                    {locale.name_en}
                    {saved.trim() === "" ? (
                      <span className="ml-2 text-caption font-normal text-text-secondary">
                        nothing published
                      </span>
                    ) : null}
                  </label>
                  <textarea
                    id={id}
                    rows={4}
                    disabled={!canEdit}
                    value={value}
                    onChange={(event) => setDrafts((d) => ({ ...d, [id]: event.target.value }))}
                    className="min-h-24 rounded-card border border-border-subtle bg-bg-canvas p-2 text-body-sm"
                  />
                  {canEdit ? (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending || value === saved}
                        onClick={() => save(notice.key, locale.code, value)}
                      >
                        {value.trim() === "" && saved !== "" ? "Take down" : "Publish"}
                      </Button>
                      {value !== saved ? (
                        <span className="text-caption text-text-secondary">Not saved yet</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
