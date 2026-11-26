import { executeStatement } from "./db";

/**
 * Periodic missions: one mission per player per day, week (Monday start) and
 * month, in the player's time zone. A period with no mission gets a random one
 * the first time the client asks (GET /profile/missions). Progress is never
 * stored: it is counted from player_attempt.finished_at inside the mission's
 * window, frozen in UTC when the mission is generated. completed_at is stamped
 * once, at the finish time of the solve that reached the target.
 */

export type Period = "day" | "week" | "month";
export const PERIODS: Period[] = ["day", "week", "month"];

export type MissionKind = "solve_count" | "solve_type" | "solve_hard" | "solve_variety";

export interface MissionParams {
  typeId?: number;
  minDifficulty?: number;
}

export interface MissionDraft {
  kind: MissionKind;
  params: MissionParams;
  target: number;
}

/** A solve inside a window: the first finish of a distinct question. */
export interface WindowSolve {
  question: string;
  typeId: number;
  difficulty: number;
  finishedAt: string; // "YYYY-MM-DD HH:MM:SS" UTC
}

/** Live puzzles the player has never solved, per type and difficulty. */
export interface OpenPuzzleCount {
  typeId: number;
  incubating: boolean;
  difficulty: number;
  count: number;
}

const DAY_MS = 86_400_000;
const HARD = 4;

// Targets per period. Each kind is offered only when the player has enough
// unsolved live puzzles to finish it.
const TARGETS: Record<Period, { count: [number, number]; type: number; hard: number; variety: number }> = {
  day: { count: [1, 3], type: 1, hard: 1, variety: 2 },
  week: { count: [5, 10], type: 3, hard: 2, variety: 4 },
  month: { count: [15, 30], type: 8, hard: 5, variety: 6 },
};

// --- Periods ---------------------------------------------------------------

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at `instant`, in ms (UTC+8 -> 8h). */
function tzOffsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** A civil date is a UTC-midnight timestamp standing for that calendar day. */
function localCivilDate(instant: number, tz: string): number {
  const local = instant + tzOffsetMs(instant, tz);
  return Math.floor(local / DAY_MS) * DAY_MS;
}

/** The UTC instant of local midnight starting `civil` in `tz` (DST-safe). */
function localMidnightUtc(civil: number, tz: string): number {
  let t = civil - tzOffsetMs(civil, tz);
  const corrected = civil - tzOffsetMs(t, tz);
  if (corrected !== t) t = corrected;
  return t;
}

export interface PeriodWindow {
  period: Period;
  periodStart: string; // local date "YYYY-MM-DD"
  startUtc: number;
  endUtc: number; // exclusive
}

export function periodWindow(period: Period, now: number, tz: string): PeriodWindow {
  const today = localCivilDate(now, tz);
  let start: number;
  let end: number;
  if (period === "day") {
    start = today;
    end = today + DAY_MS;
  } else if (period === "week") {
    const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
    start = today - mondayOffset * DAY_MS;
    end = start + 7 * DAY_MS;
  } else {
    const d = new Date(today);
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return {
    period,
    periodStart: new Date(start).toISOString().slice(0, 10),
    startUtc: localMidnightUtc(start, tz),
    endUtc: localMidnightUtc(end, tz),
  };
}

export function toSqlDateTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

export function sqlDateTimeToIso(s: string): string {
  return s.replace(" ", "T") + "Z";
}

// --- Generation ------------------------------------------------------------

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: () => number, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

/**
 * Pick a random mission the player can finish. Incubating types are left out
 * of type missions (a handful of puzzles each). Returns null only when the
 * player has nothing left to solve.
 */
export function generateMission(
  period: Period,
  open: OpenPuzzleCount[],
  rng: () => number = Math.random
): MissionDraft | null {
  const t = TARGETS[period];
  const totalOpen = open.reduce((s, o) => s + o.count, 0);
  if (totalOpen === 0) return null;

  const openByType = new Map<number, number>();
  for (const o of open) {
    if (o.incubating) continue;
    openByType.set(o.typeId, (openByType.get(o.typeId) ?? 0) + o.count);
  }
  const hardOpen = open.filter((o) => o.difficulty >= HARD).reduce((s, o) => s + o.count, 0);
  const typesWithOpen = new Set(open.filter((o) => o.count > 0).map((o) => o.typeId)).size;

  const options: (() => MissionDraft)[] = [];

  options.push(() => ({
    kind: "solve_count",
    params: {},
    target: Math.min(totalOpen, randInt(rng, t.count[0], t.count[1])),
  }));

  const typeIds = [...openByType].filter(([, n]) => n >= t.type).map(([id]) => id);
  if (typeIds.length > 0) {
    options.push(() => ({ kind: "solve_type", params: { typeId: pick(rng, typeIds) }, target: t.type }));
  }

  if (hardOpen >= t.hard) {
    options.push(() => ({ kind: "solve_hard", params: { minDifficulty: HARD }, target: t.hard }));
  }

  if (typesWithOpen >= t.variety) {
    options.push(() => ({ kind: "solve_variety", params: {}, target: t.variety }));
  }

  return pick(rng, options)();
}

// --- Progress --------------------------------------------------------------

export interface MissionProgress {
  progress: number;
  completedAt: string | null; // "YYYY-MM-DD HH:MM:SS" UTC
}

/** Progress of a mission from the solves inside its window (any order). */
export function evaluateMission(
  mission: { kind: MissionKind; params: MissionParams; target: number },
  solves: WindowSolve[]
): MissionProgress {
  const sorted = [...solves].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  let progress = 0;
  let completedAt: string | null = null;
  const types = new Set<number>();

  for (const s of sorted) {
    switch (mission.kind) {
      case "solve_count":
        progress++;
        break;
      case "solve_type":
        if (s.typeId === mission.params.typeId) progress++;
        break;
      case "solve_hard":
        if (s.difficulty >= (mission.params.minDifficulty ?? HARD)) progress++;
        break;
      case "solve_variety":
        types.add(s.typeId);
        progress = types.size;
        break;
    }
    if (completedAt === null && progress >= mission.target) completedAt = s.finishedAt;
  }
  return { progress: Math.min(progress, mission.target), completedAt };
}

export function describeMission(
  kind: MissionKind,
  params: MissionParams,
  target: number,
  typeLabels: Map<number, string>
): string {
  const s = target === 1 ? "" : "s";
  switch (kind) {
    case "solve_count":
      return `Solve ${target} puzzle${s}`;
    case "solve_type":
      return `Solve ${target} ${typeLabels.get(params.typeId!) ?? "puzzle"} puzzle${s}`;
    case "solve_hard":
      return `Solve ${target} Hard or Super-Hard puzzle${s}`;
    case "solve_variety":
      return `Solve puzzles of ${target} different types`;
  }
}

// --- DB --------------------------------------------------------------------

export interface MissionView {
  id: number;
  period: Period;
  periodStart: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  kind: MissionKind;
  typeId: number | null;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  completedAt: string | null; // ISO UTC
}

const longParam = (name: string, v: number) => ({ name, value: { longValue: v } });
const strParam = (name: string, v: string) => ({ name, value: { stringValue: v } });

const DATETIME_FMT = "'%Y-%m-%d %H:%i:%s'";

async function loadOpenPuzzleCounts(playerId: number): Promise<OpenPuzzleCount[]> {
  const result = await executeStatement(
    `SELECT pq.puzzle_type AS type_id, pt.incubating, pq.difficulty, COUNT(*) AS cnt
     FROM puzzle_questions pq
     JOIN puzzle_types pt ON pt.id = pq.puzzle_type
     WHERE pq.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM player_attempt pa
         WHERE pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
       )
     GROUP BY pq.puzzle_type, pt.incubating, pq.difficulty`,
    [longParam("player", playerId)]
  );
  return result.records.map((r) => ({
    typeId: r.type_id as number,
    incubating: Boolean(Number(r.incubating)),
    difficulty: r.difficulty as number,
    count: r.cnt as number,
  }));
}

async function selectMissions(playerId: number, windows: PeriodWindow[]) {
  const where = windows
    .map((w, i) => `(period = :p${i} AND period_start = :s${i})`)
    .join(" OR ");
  const params = windows.flatMap((w, i) => [strParam(`p${i}`, w.period), strParam(`s${i}`, w.periodStart)]);
  const result = await executeStatement(
    `SELECT id, period, DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
            DATE_FORMAT(window_start, ${DATETIME_FMT}) AS window_start,
            DATE_FORMAT(window_end, ${DATETIME_FMT}) AS window_end,
            kind, params, target,
            DATE_FORMAT(completed_at, ${DATETIME_FMT}) AS completed_at
     FROM player_mission
     WHERE player = :player AND (${where})`,
    [longParam("player", playerId), ...params]
  );
  return result.records.map((r) => ({
    id: r.id as number,
    period: r.period as Period,
    periodStart: r.period_start as string,
    windowStart: r.window_start as string,
    windowEnd: r.window_end as string,
    kind: r.kind as MissionKind,
    params: JSON.parse((r.params as string) || "{}") as MissionParams,
    target: r.target as number,
    completedAt: (r.completed_at as string | null) ?? null,
  }));
}

/**
 * The player's current day, week and month missions, generating any that are
 * missing. `tz` is an IANA zone name (already validated).
 */
export async function getCurrentMissions(
  playerId: number,
  tz: string,
  now: number = Date.now()
): Promise<MissionView[]> {
  const windows = PERIODS.map((p) => periodWindow(p, now, tz));
  let rows = await selectMissions(playerId, windows);

  const missing = windows.filter((w) => !rows.some((r) => r.period === w.period));
  if (missing.length > 0) {
    const open = await loadOpenPuzzleCounts(playerId);
    let inserted = false;
    for (const w of missing) {
      const draft = generateMission(w.period, open);
      if (!draft) continue;
      // INSERT IGNORE: a concurrent request may have generated it already.
      await executeStatement(
        `INSERT IGNORE INTO player_mission
           (player, period, period_start, window_start, window_end, kind, params, target)
         VALUES (:player, :period, :periodStart, :windowStart, :windowEnd, :kind, :params, :target)`,
        [
          longParam("player", playerId),
          strParam("period", w.period),
          strParam("periodStart", w.periodStart),
          strParam("windowStart", toSqlDateTime(w.startUtc)),
          strParam("windowEnd", toSqlDateTime(w.endUtc)),
          strParam("kind", draft.kind),
          strParam("params", JSON.stringify(draft.params)),
          longParam("target", draft.target),
        ]
      );
      inserted = true;
    }
    if (inserted) rows = await selectMissions(playerId, windows);
  }
  if (rows.length === 0) return [];

  const from = rows.map((r) => r.windowStart).sort()[0];
  const ends = rows.map((r) => r.windowEnd).sort();
  const to = ends[ends.length - 1];
  const [solvesResult, typesResult] = await Promise.all([
    executeStatement(
      `SELECT pa.question, pq.puzzle_type AS type_id, pq.difficulty,
              DATE_FORMAT(MIN(pa.finished_at), ${DATETIME_FMT}) AS finished_at
       FROM player_attempt pa
       JOIN puzzle_questions pq ON pq.id = pa.question
       WHERE pa.player = :player AND pa.finished_at >= :from AND pa.finished_at < :to
       GROUP BY pa.question, pq.puzzle_type, pq.difficulty`,
      [longParam("player", playerId), strParam("from", from), strParam("to", to)]
    ),
    executeStatement(`SELECT id, jp_label FROM puzzle_types`),
  ]);
  const allSolves: WindowSolve[] = solvesResult.records.map((r) => ({
    question: r.question as string,
    typeId: r.type_id as number,
    difficulty: r.difficulty as number,
    finishedAt: r.finished_at as string,
  }));
  const typeLabels = new Map(typesResult.records.map((r) => [r.id as number, r.jp_label as string]));

  const views: MissionView[] = [];
  for (const r of rows) {
    const solves = allSolves.filter((s) => s.finishedAt >= r.windowStart && s.finishedAt < r.windowEnd);
    const { progress, completedAt: reachedAt } = evaluateMission(r, solves);
    let completedAt = r.completedAt;
    if (!completedAt && reachedAt) {
      completedAt = reachedAt;
      await executeStatement(
        `UPDATE player_mission SET completed_at = :completedAt WHERE id = :id AND completed_at IS NULL`,
        [strParam("completedAt", reachedAt), longParam("id", r.id)]
      );
    }
    views.push({
      id: r.id,
      period: r.period,
      periodStart: r.periodStart,
      startsAt: sqlDateTimeToIso(r.windowStart),
      endsAt: sqlDateTimeToIso(r.windowEnd),
      kind: r.kind,
      typeId: r.params.typeId ?? null,
      description: describeMission(r.kind, r.params, r.target, typeLabels),
      progress: completedAt ? r.target : progress,
      target: r.target,
      completed: completedAt !== null,
      completedAt: completedAt ? sqlDateTimeToIso(completedAt) : null,
    });
  }
  views.sort((a, b) => PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period));
  return views;
}
