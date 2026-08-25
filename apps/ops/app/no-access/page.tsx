import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "No access · Mandhira Ops" };

/**
 * Where the role gate sends a signed-in user who holds no Ops role.
 *
 * Deliberately says nothing about what Ops contains or which roles exist — an account
 * without access learns only that it lacks access.
 */
export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-8 py-10">
      <h1 className="text-h1">This account doesn&apos;t have Ops access</h1>
      <p className="text-body text-text-secondary">
        You&apos;re signed in, but this account hasn&apos;t been given an operations role. Ask an
        administrator to add one, then sign in again.
      </p>
      <SignOutButton />
    </main>
  );
}
