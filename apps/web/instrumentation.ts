/**
 * Runs once when the server starts, before any request is served.
 *
 * Validates configuration with the same rules the deploy preflight uses. In production a
 * blocking misconfiguration stops the server here, where the log says exactly what is wrong,
 * rather than surfacing later as a traveler's screen that loads and quietly does nothing.
 */
export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  const { assertEnv } = await import("@mandhira/config/env-rules");
  assertEnv("web");
}
