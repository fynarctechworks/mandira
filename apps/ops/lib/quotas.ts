/** Free quotas on O01 (MON-01, `provider_usage_status()` in 0050). */

export type ProviderUsage = {
  provider: string;
  period: string;
  label: string;
  quota: number;
  used: number;
  share: number;
  near_limit: boolean;
  note: string | null;
};

/** Quotas reset on UTC days and months, and the label says so. */
export function periodLabel(period: string): string {
  return period === "month" ? "This month (UTC)" : "Today (UTC)";
}

/** Bars stop at full: a quota at 130 % is shown as full, with the number saying how far over. */
export function barValue(share: number): number {
  return Math.max(0, Math.min(100, share));
}
