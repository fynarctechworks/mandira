import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Mandhira Ops" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-8 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text-secondary">Mandhira Ops</p>
        <h1 className="text-h1">Sign in</h1>
        <p className="text-body text-text-secondary">
          We&apos;ll email you a link. No password to remember.
        </p>
      </header>

      <SignInForm next={params.next ?? "/"} />

      {params.message ? (
        <p role="status" className="text-body-sm text-status-tight">
          {params.message}
        </p>
      ) : null}
    </main>
  );
}
