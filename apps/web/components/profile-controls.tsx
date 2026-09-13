"use client";

import { Button } from "@mandhira/ui/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@mandhira/ui/components/ui/field";
import { Input } from "@mandhira/ui/components/ui/input";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** The traveler's name (A23). Saved only on the tap, never on typing. */
export function AccountNameForm({ initialName }: { initialName: string | null }) {
  const t = useTranslations("profile");
  const [name, setName] = useState(initialName ?? "");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"saved" | "not_saved" | null>(null);

  async function save() {
    setPending(true);
    setStatus(null);

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: name.trim() || null }),
    }).catch(() => null);

    const payload = response ? await response.json().catch(() => ({ ok: false })) : { ok: false };
    setStatus(payload.ok ? "saved" : "not_saved");
    setPending(false);
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field>
        <FieldLabel htmlFor="display-name" className="text-sm">
          {t("display_name")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={name}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            className="h-11 flex-1 text-sm"
          />
          <Button type="submit" disabled={pending} className="min-h-11 px-4 text-sm">
            {t("save")}
          </Button>
        </div>
        <FieldDescription>{t("display_name_hint")}</FieldDescription>
      </Field>
      <p role="status" className={status === "not_saved" ? "text-sm text-destructive" : "text-sm"}>
        {status ? t(status) : null}
      </p>
    </form>
  );
}

/** Sign out, then back to the home screen as a guest. */
export function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const { createBrowserSupabase } = await import("@mandhira/db/client/browser");
    await createBrowserSupabase().auth.signOut();
    router.replace(`/${locale}`);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => void signOut()}
      className="min-h-11 gap-2 text-sm"
    >
      <LogOut className="size-4" aria-hidden />
      {t("sign_out")}
    </Button>
  );
}
