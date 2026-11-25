// Calendar math for the profile's activity heat map. Dates are plain
// 'YYYY-MM-DD' strings in the player's time zone (as GET /history returns them);
// arithmetic runs on UTC midnights so no local DST shift can move a day.
// Mirrored on Android in ui/screens/ActivityCalendar.kt — keep the two in step.

const DAY_MS = 24 * 3600 * 1000;

/** Weeks shown: this week plus the 52 before it (about a year). */
export const CALENDAR_WEEKS = 53;

/** Lower bounds of shade levels 1..4 (level 0 = no solves). */
export const LEVEL_THRESHOLDS = [1, 3, 6, 11];

/** date (YYYY-MM-DD) -> puzzle type id -> count, as GET /history returns. */
export type HistoryDays = Record<string, Record<string, number>>;

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toMs(date)).getUTCDay();
}

/** Today's date in a time zone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The range to fetch: from the Sunday CALENDAR_WEEKS-1 weeks back, to today. */
export function calendarRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -weekday(today) - (CALENDAR_WEEKS - 1) * 7), to: today };
}

/** Columns of 7 days (Sunday first) from `from`; days after `today` are null. */
export function buildWeeks(from: string, today: string): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const week: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(from, w * 7 + d);
      week.push(date <= today ? date : null);
    }
    weeks.push(week);
  }
  return weeks;
}

export function dayTotal(byType: Record<string, number> | undefined): number {
  if (!byType) return 0;
  let total = 0;
  for (const n of Object.values(byType)) total += n;
  return total;
}

export function level(count: number): number {
  let lv = 0;
  for (const t of LEVEL_THRESHOLDS) if (count >= t) lv++;
  return lv;
}

/**
 * Month label per week column: the short month name on the first column whose
 * Sunday falls in a new month, else "". The first column is skipped when its
 * month changes again within two weeks, so labels don't overlap.
 */
export function monthLabels(weeks: (string | null)[][]): string[] {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const labels: string[] = [];
  let prev = -1;
  for (const week of weeks) {
    const first = week[0];
    const month = first ? Number(first.slice(5, 7)) - 1 : prev;
    labels.push(month !== prev ? names[month] : "");
    prev = month;
  }
  if (labels.length > 2 && labels[0] && (labels[1] || labels[2])) labels[0] = "";
  return labels;
}

export interface ActivitySummary {
  total: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Totals and streaks over the fetched days. The current streak counts back from
 * today, or from yesterday while today has no solve yet, so a streak isn't shown
 * as broken before the day is over.
 */
export function summarize(days: HistoryDays, today: string): ActivitySummary {
  const active = Object.keys(days).filter((d) => dayTotal(days[d]) > 0).sort();
  const total = active.reduce((sum, d) => sum + dayTotal(days[d]), 0);

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of active) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  const activeSet = new Set(active);
  let cursor = activeSet.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (activeSet.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { total, activeDays: active.length, currentStreak: current, longestStreak: longest };
}
