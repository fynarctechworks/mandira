import { ApiError } from "@mandhira/db/api";
import { z } from "zod";

import { exportMyData } from "../../../../lib/account";
import { withApi } from "../../../../lib/api";

/**
 * DPDP export (PRD-PRIV-003, TRD §5.2).
 *
 * Everything held about the signed-in traveler, as a file they keep. `withApi` does the
 * validation, sign-in and rate limit as for every route; only a successful answer is then
 * re-sent as an attachment instead of the JSON envelope, so a refusal still reads like one.
 */
const exportData = withApi({
  schema: z.void(),
  requireAuth: true,
  rateLimit: "journeys_write",
  handler: async ({ supabase }) => {
    const data = await exportMyData(supabase);
    if (!data) throw new ApiError("not_found");
    return data;
  },
});

export async function POST(request: Request): Promise<Response> {
  const response = await exportData(request);
  if (response.status !== 200) return response;

  const { data } = (await response.json()) as { data: unknown };
  const day = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mandhira-my-data-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
