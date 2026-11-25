import { executeStatement } from "./db";

/**
 * Player history: per-day activity counts, by puzzle type, in the player's own
 * time zone. Shared by GET /history and, later, server-side missions and
 * time-window achievements, so every feature counts a "day" the same way.
 *
 * Metrics:
 * - "solved": finished attempts, bucketed by finished_at. A replay of the same
 *   puzzle counts again (lifetime achievements still count distinct puzzles).
 *
 * New metrics (e.g. "tried") are added to HISTORY_METRICS and fetchEvents only;
 * the response shape stays the same.
 */

export const HISTORY_METRICS = ["solved"] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];

/** Longest range one request may cover, in days (inclusive). */
export const MAX_RANGE_DAYS = 400;

/** No time zone is more than 14h from UTC; widen the UTC query window by this. */
const TZ_SLACK_MS = 14 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface HistoryQuery {
  player: number;
  from: string; // YYYY-MM-DD, inclusive, in tz
  to: string; // YYYY-MM-DD, inclusive, in tz
  tz: string; // IANA zone name
  metric: HistoryMetric;
}

/** One counted event: a UTC timestamp ('YYYY-MM-DD HH:MM:SS') and its puzzle type. */
export interface HistoryEvent {
  at: string;
  puzzleType: number;
}

/** date (YYYY-MM-DD in tz) -> puzzle type id -> count. Days without activity are absent. */
export type HistoryDays = Record<string, Record<string, number>>;

export interface HistoryResult {
  from: string;
  to: string;
  tz: string;
  metric: HistoryMetric;
  days: HistoryDays;
}

/** Midnight UTC of a YYYY-MM-DD date, or NaN if it isn't a real calendar date. */
function dateToUtcMs(date: string): number {
  if (!DATE_RE.test(date)) return NaN;
  const ms = Date.parse(`${date}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March; reject it instead.
  if (isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return NaN;
  return ms;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate raw query-string params. Returns the parsed query or an error
 * message for a 400.
 */
export function parseHistoryQuery(
  params: Record<string, string | undefined> | null
): HistoryQuery | { error: string } {
  const p = params ?? {};
  const player = Number(p.player);
  if (!Number.isInteger(player) || player <= 0) {
    return { error: "player is required" };
  }
  const from = p.from ?? "";
  const to = p.to ?? "";
  const fromMs = dateToUtcMs(from);
  const toMs = dateToUtcMs(to);
  if (isNaN(fromMs) || isNaN(toMs)) {
    return { error: "from and to are required dates (YYYY-MM-DD)" };
  }
  if (fromMs > toMs) return { error: "from must not be after to" };
  if ((toMs - fromMs) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    return { error: `range must be at most ${MAX_RANGE_DAYS} days` };
  }
  const tz = p.tz || "UTC";
  if (!isValidTimeZone(tz)) return { error: `unknown time zone: ${tz}` };
  const metric = (p.metric || "solved") as HistoryMetric;
  if (!HISTORY_METRICS.includes(metric)) {
    return { error: `metric must be one of: ${HISTORY_METRICS.join(", ")}` };
  }
  return { player, from, to, tz, metric };
}

function toSqlDatetime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * The UTC window that covers every instant of [from, to] in any time zone.
 * Events outside the exact local range are dropped by bucketEvents.
 */
export function utcWindow(from: string, to: string): { start: string; end: string } {
  return {
    start: toSqlDatetime(dateToUtcMs(from) - TZ_SLACK_MS),
    end: toSqlDatetime(dateToUtcMs(to) + DAY_MS + TZ_SLACK_MS),
  };
}

/** The local calendar date (YYYY-MM-DD) of a UTC 'YYYY-MM-DD HH:MM:SS' in tz. */
export function localDate(utc: string, tz: string): string {
  const ms = Date.parse(`${utc.replace(" ", "T")}Z`);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}

/** Count events per local day and puzzle type, keeping only days in [from, to]. */
export function bucketEvents(
  events: HistoryEvent[],
  from: string,
  to: string,
  tz: string
): HistoryDays {
  const days: HistoryDays = {};
  for (const e of events) {
    const day = localDate(e.at, tz);
    if (day < from || day > to) continue;
    const byType = (days[day] ??= {});
    const key = String(e.puzzleType);
    byType[key] = (byType[key] ?? 0) + 1;
  }
  return days;
}

async function fetchEvents(q: HistoryQuery): Promise<HistoryEvent[]> {
  const { start, end } = utcWindow(q.from, q.to);
  // metric === "solved" (the only one so far).
  const result = await executeStatement(
    `SELECT pa.finished_at AS at, pq.puzzle_type AS puzzle_type
     FROM player_attempt pa
     JOIN puzzle_questions pq ON pq.id = pa.question
     WHERE pa.player = :player
       AND pa.finished_at >= :start AND pa.finished_at < :end`,
    [
      { name: "player", value: { longValue: q.player } },
      { name: "start", value: { stringValue: start } },
      { name: "end", value: { stringValue: end } },
    ]
  );
  return result.records.map((r) => ({
    at: String(r.at),
    puzzleType: Number(r.puzzle_type),
  }));
}

export async function getHistory(q: HistoryQuery): Promise<HistoryResult> {
  const events = await fetchEvents(q);
  return {
    from: q.from,
    to: q.to,
    tz: q.tz,
    metric: q.metric,
    days: bucketEvents(events, q.from, q.to, q.tz),
  };
}
