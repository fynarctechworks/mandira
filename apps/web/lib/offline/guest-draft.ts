import { db, META_GUEST_DRAFT, offlineAvailable } from "./db";

/**
 * A guest's unsaved journey, kept on their own device (PRD-ACCT-001, carried from B-019).
 *
 * B-019 resolved a documented conflict in favour of this: the TRD's `journeys.status =
 * draft` implied a server-side draft for someone with no account, which would mean writing
 * a stranger's plan to our database before they have agreed to anything. PRD-ACCT-001 is
 * guest-first and PRD §10 treats journey contents as personal, so a guest's draft lives
 * HERE — on their phone, in their browser, under nobody's account.
 *
 * Which makes deletion part of the feature, not tidying up. This is a shared-phone product
 * in a shared-phone market: the moment a draft has been migrated into an account, the local
 * copy has to go, or the next person to open the app is reading someone else's pilgrimage.
 */
export type GuestDraft = {
  /** The brief exactly as the preview URL carries it, so it can be replayed verbatim. */
  brief: Record<string, unknown>;
  savedAt: string;
};

export async function saveGuestDraft(brief: Record<string, unknown>): Promise<void> {
  if (!offlineAvailable()) return;

  try {
    await db().meta.put({
      key: META_GUEST_DRAFT,
      value: { brief, savedAt: new Date().toISOString() } satisfies GuestDraft,
    });
  } catch {
    // A draft that could not be kept is a mild disappointment, not something to interrupt
    // someone with. The brief is still in the URL, which is what B-019 designed for.
  }
}

export async function readGuestDraft(): Promise<GuestDraft | null> {
  if (!offlineAvailable()) return null;

  try {
    const row = await db().meta.get(META_GUEST_DRAFT);
    const draft = row?.value as GuestDraft | undefined;
    if (!draft?.brief) return null;

    /*
     * A month, then it is gone. A guest draft is a half-finished thought, and one from
     * six weeks ago is more likely to confuse than to help — the dates in it have usually
     * passed. Expiry is checked on READ rather than by a job, because there is no job on a
     * device that has been closed since.
     */
    if (Date.now() - Date.parse(draft.savedAt) > 30 * 86_400_000) {
      await clearGuestDraft();
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export async function clearGuestDraft(): Promise<void> {
  if (!offlineAvailable()) return;
  try {
    await db().meta.delete(META_GUEST_DRAFT);
  } catch {
    // Ignored deliberately — see the module comment.
  }
}

/**
 * Move a guest's draft into their new account, then forget it locally.
 *
 * The order matters and is not interchangeable: save first, delete only on success. A
 * delete-then-save that fails loses the journey the traveler just signed up to keep, which
 * is the worst possible first impression of an account.
 */
export async function migrateGuestDraft(): Promise<{ journeyId: string } | null> {
  const draft = await readGuestDraft();
  if (!draft) return null;

  try {
    const response = await fetch("/api/journeys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft.brief),
    });

    const payload = await response.json();
    if (!payload.ok) return null;

    await clearGuestDraft();
    return { journeyId: payload.data.journeyId as string };
  } catch {
    return null;
  }
}
