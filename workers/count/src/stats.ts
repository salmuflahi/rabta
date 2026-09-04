// Reading the aggregates back. Five queries, one batch, whatever the window.

import { shiftDay, utcDay } from "./day";

export interface Totals {
  views: number;
  visitors: number;
}

export interface DayPoint extends Totals {
  day: string;
}

export interface Stats {
  today: Totals;
  last7: Totals;
  last30: Totals;
  /** One point per day, oldest first, zero-filled, ending today. */
  series: DayPoint[];
  pages: { path: string; n: number }[];
  referrers: { host: string; n: number }[];
  countries: { cc: string; n: number }[];
  devices: { class: string; n: number }[];
}

const TOP = 15;

function sum(points: DayPoint[]): Totals {
  return points.reduce(
    (acc, p) => ({ views: acc.views + p.views, visitors: acc.visitors + p.visitors }),
    { views: 0, visitors: 0 },
  );
}

/**
 * Everything the dashboard shows, for the last `days` days ending today (UTC).
 * "Visitors" over a window is the sum of each day's unique visitors: hashes do
 * not survive the day, so a person who returns tomorrow counts again.
 */
export async function readStats(db: D1Database, days = 30, now: Date = new Date()): Promise<Stats> {
  const today = utcDay(now);
  const since = shiftDay(today, -(days - 1));
  const top = (table: string, key: string) =>
    db
      .prepare(`SELECT ${key} AS k, SUM(n) AS n FROM ${table} WHERE day >= ? GROUP BY ${key} ORDER BY n DESC, k LIMIT ${TOP}`)
      .bind(since);

  const [dayRows, pages, referrers, countries, devices] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT day, views, visitors FROM days WHERE day >= ? ORDER BY day").bind(since),
    top("hits", "path"),
    top("refs", "host"),
    top("geo", "cc"),
    top("devices", "class"),
  ]);

  const byDay = new Map<string, Totals>();
  for (const row of dayRows?.results ?? []) {
    byDay.set(String(row.day), { views: Number(row.views), visitors: Number(row.visitors) });
  }
  const series: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = shiftDay(since, i);
    series.push({ day, ...(byDay.get(day) ?? { views: 0, visitors: 0 }) });
  }

  const list = <K extends string>(result: D1Result<Record<string, unknown>> | undefined, key: K) =>
    (result?.results ?? []).map((row) => ({ [key]: String(row.k), n: Number(row.n) }) as Record<K, string> & { n: number });

  return {
    today: sum(series.slice(-1)),
    last7: sum(series.slice(-7)),
    last30: sum(series.slice(-30)),
    series,
    pages: list(pages, "path"),
    referrers: list(referrers, "host"),
    countries: list(countries, "cc"),
    devices: list(devices, "class"),
  };
}
