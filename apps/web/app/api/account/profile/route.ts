import { LOCALES } from "@mandhira/i18n";
import { z } from "zod";

import { updateProfile } from "../../../../lib/account";
import { withApi } from "../../../../lib/api";

/**
 * The traveler's name and language (PRD F13, A23).
 *
 * `locale` is what the language switcher saves, so a traveler who picks Telugu on one phone
 * finds Telugu on the next. An empty name is stored as no name, not as an empty string.
 */
const schema = z
  .object({
    displayName: z.string().trim().max(80).nullable().optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((value) => value.displayName !== undefined || value.locale !== undefined, {
    message: "Nothing to change.",
  });

export const PATCH = withApi({
  schema,
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ input, supabase, user }) => {
    const displayName =
      input.displayName === undefined ? undefined : (input.displayName ?? "") || null;

    await updateProfile(supabase, user!.id, { displayName, locale: input.locale });
    return { saved: true };
  },
});
