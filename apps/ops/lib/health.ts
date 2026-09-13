/** The shape `knowledge_health()` returns (0032). */
export type QueueHead = { open: number | null; oldest_at: string | null };

export type JobHealth = {
  job_name: string;
  interval_seconds: number;
  last_run_at: string | null;
  last_status: string | null;
  missed_two_windows: boolean;
  needs_attention: boolean;
};

export type KnowledgeHealth = {
  generated_at: string;
  trust: {
    total: number;
    fresh: number;
    aging: number;
    stale: number;
    low_confidence: number;
    conflicted: number;
    unverified: number;
  };
  queues: {
    review: QueueHead;
    verify: QueueHead;
    reverify: QueueHead;
    conflicts: QueueHead;
    reports: QueueHead;
    publish: QueueHead;
    scheduled: { open: number | null; next_at: string | null };
  };
  locales: { code: string; name: string; published: number; translated: number }[];
  destinations: {
    id: string;
    slug: string;
    name: string;
    status: string;
    places: number;
    experiences: number;
    routes: number;
    advisories: number;
  }[];
  jobs: JobHealth[];
};

export type QueueRow = {
  key: string;
  label: string;
  href: string;
  open: number;
  /** The oldest waiting item, or for schedules the next one due. */
  at: string | null;
  kind: "waiting" | "due";
};

/** Every queue on the dashboard, in the order work flows through them, each with its screen. */
export function queueRows(queues: KnowledgeHealth["queues"]): QueueRow[] {
  const waiting = (
    key: keyof Omit<KnowledgeHealth["queues"], "scheduled">,
    label: string,
    href: string,
  ): QueueRow => ({
    key,
    label,
    href,
    open: Number(queues[key].open ?? 0),
    at: queues[key].oldest_at,
    kind: "waiting",
  });

  return [
    waiting("review", "Review", "/review"),
    waiting("verify", "Verify", "/verify"),
    waiting("conflicts", "Conflicts", "/conflicts"),
    waiting("publish", "Approve & publish", "/publish"),
    waiting("reports", "Reports", "/reports"),
    waiting("reverify", "Re-verification", "/freshness"),
    {
      key: "scheduled",
      label: "Scheduled publishes",
      href: "/publish#scheduled",
      open: Number(queues.scheduled.open ?? 0),
      at: queues.scheduled.next_at,
      kind: "due",
    },
  ];
}

/** Whole-number percentage, 0 when there is nothing to divide by. */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** "every 5 minutes", "hourly", "daily" — for a job's expected cadence. */
export function everyLabel(seconds: number): string {
  if (seconds % 86_400 === 0)
    return seconds === 86_400 ? "daily" : `every ${seconds / 86_400} days`;
  if (seconds % 3_600 === 0) return seconds === 3_600 ? "hourly" : `every ${seconds / 3_600} hours`;
  return `every ${Math.round(seconds / 60)} minutes`;
}
