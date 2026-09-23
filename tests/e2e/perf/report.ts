/**
 * One line per measurement, against BOTH columns of TRD §9 — the Milestone 1 target, which
 * the suite asserts, and the production target (TRD-PERF-002), which it reports.
 *
 * Production is reported rather than asserted because it describes a later milestone: a
 * number that is within M1 and over production is not a failure today, it is the next
 * piece of work, and a suite that failed on it would be failing on a plan. Printing it
 * means the evidence for TRD-PERF-002's performance half exists and is current; the other
 * half, 99.5 % availability, can only be observed in production itself.
 */
export function report(
  metric: string,
  measured: number,
  milestone: number,
  production: number,
): void {
  const verdict = (budget: number) => (measured <= budget ? "within" : "OVER  ");
  // eslint-disable-next-line no-console -- the measurement IS the output of this suite.
  console.log(
    `  ${metric.padEnd(34)} ${Math.round(measured).toString().padStart(6)} ms  ` +
      `M1 ${verdict(milestone)} ${milestone} ms · production ${verdict(production)} ${production} ms`,
  );
}
