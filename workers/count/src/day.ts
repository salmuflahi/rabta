// The counter has exactly one clock: the UTC calendar day. Every table is
// keyed by it, the visitor salt rotates on it, and the purge cron runs on it.

/** Today (or the given instant) as YYYY-MM-DD in UTC. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The day `n` days after `day` (negative `n` walks back), in UTC. */
export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDay(d);
}
