import { executeStatement } from "./db";
import { NONOGRAM, SizeTag, sizeTag } from "./sizeTag";

/**
 * Periodic missions. Each player gets a fixed set per day, week (Monday start)
 * and month, in their time zone, drawn at random the first time a period with
 * no missions is asked for (GET /profile/missions):
 * - day: solve a puzzle of type A, of type B, of type C (three distinct
 *   non-incubating types), and one Hard+ puzzle;
 * - week: solve 20 puzzles, 10 Hard+ puzzles, and three assigned unsolved BIG
 *   puzzles;
 * - month: two assigned unsolved GIANT puzzles, one of them a nonogram (a BIG
 *   one when no GIANT nonogram is left).
 * A mission is left out when the player hasn't enough unsolved live puzzles
 * for it, and a count is capped at what's left.
 *
 * Progress is never stored: it is counted from player_attempt.finished_at
 * inside the mission's window, frozen in UTC at generation. completed_at is
 * stamped once, at the finish time of the solve that reached the target.
 */

export type Period = "day" | "week" | "month";
export const PERIODS: Period[] = ["day", "week", "month"];

export type MissionKind = "solve_count" | "solve_type" | "solve_hard" | "solve_assigned";

export interface MissionParams {
  typeId?: number;
  minDifficulty?: number;
  /** solve_assigned: the puzzle to solve and its size pill. */
  questionId?: string;
  size?: SizeTag;
}

export interface MissionDraft {
  slot: number;
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

/** A live puzzle the player has never solved. */
export interface OpenPuzzle {
  id: string;
  typeId: number;
  incubating: boolean;
  difficulty: number;
  size: SizeTag | null;
}

const DAY_MS = 86_400_000;
const HARD = 4;

const DAILY_TYPES = 3;
const WEEKLY_COUNT = 20;
const WEEKLY_HARD = 10;
const WEEKLY_BIG = 3;

// --- Periods ---------------------------------------------------------------

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

/** k distinct random items of xs (all of them when there are fewer). */
function sample<T>(rng: () => number, xs: T[], k: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** The period's missions, in slot order; empty when nothing is left to solve. */
export function generateMissions(
  period: Period,
  open: OpenPuzzle[],
  rng: () => number = Math.random
): MissionDraft[] {
  const out: Omit<MissionDraft, "slot">[] = [];
  const hardOpen = open.filter((p) => p.difficulty >= HARD).length;
  const assign = (p: OpenPuzzle) =>
    out.push({ kind: "solve_assigned", params: { questionId: p.id, size: p.size! }, target: 1 });

  if (period === "day") {
    const types = [...new Set(open.filter((p) => !p.incubating).map((p) => p.typeId))];
    for (const typeId of sample(rng, types, DAILY_TYPES)) {
      out.push({ kind: "solve_type", params: { typeId }, target: 1 });
    }
    if (hardOpen > 0) out.push({ kind: "solve_hard", params: { minDifficulty: HARD }, target: 1 });
  } else if (period === "week") {
    if (open.length > 0) {
      out.push({ kind: "solve_count", params: {}, target: Math.min(WEEKLY_COUNT, open.length) });
    }
    if (hardOpen > 0) {
      out.push({ kind: "solve_hard", params: { minDifficulty: HARD }, target: Math.min(WEEKLY_HARD, hardOpen) });
    }
    sample(rng, open.filter((p) => p.size === "BIG"), WEEKLY_BIG).forEach(assign);
  } else {
    const giants = open.filter((p) => p.size === "GIANT");
    // The nonogram slot takes the biggest nonogram left: GIANT, else BIG.
    const giantNonograms = giants.filter((p) => p.typeId === NONOGRAM);
    const nonograms = giantNonograms.length > 0
      ? giantNonograms
      : open.filter((p) => p.typeId === NONOGRAM && p.size === "BIG");
    const others = giants.filter((p) => p.typeId !== NONOGRAM);
    const picks = [...sample(rng, nonograms, 1), ...sample(rng, others, 1)];
    // Short of one kind, the other fills both slots.
    if (picks.length < 2) {
      picks.push(...sample(rng, giants.filter((p) => !picks.includes(p)), 2 - picks.length));
    }
    picks.forEach(assign);
  }
  return out.map((m, slot) => ({ slot, ...m }));
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

  for (const s of sorted) {
    let counts = false;
    switch (mission.kind) {
      case "solve_count":
        counts = true;
        break;
      case "solve_type":
        counts = s.typeId === mission.params.typeId;
        break;
      case "solve_hard":
        counts = s.difficulty >= (mission.params.minDifficulty ?? HARD);
        break;
      case "solve_assigned":
        counts = s.question === mission.params.questionId;
        break;
    }
    if (counts) progress++;
    if (completedAt === null && progress >= mission.target) completedAt = s.finishedAt;
  }
  return { progress: Math.min(progress, mission.target), completedAt };
}

export function describeMission(
  kind: MissionKind,
  params: MissionParams,
  target: number,
  typeLabels: Map<number, string>,
  assignedTypeId?: number
): string {
  const s = target === 1 ? "" : "s";
  switch (kind) {
    case "solve_count":
      return `Solve ${target} puzzle${s}`;
    case "solve_type":
      return `Solve ${target === 1 ? "a" : target} ${typeLabels.get(params.typeId!) ?? "puzzle"}${target === 1 ? "" : " puzzles"}`;
    case "solve_hard":
      return target === 1 ? "Solve a Hard or Super-Hard puzzle" : `Solve ${target} Hard or Super-Hard puzzles`;
    case "solve_assigned": {
      const label = assignedTypeId != null ? typeLabels.get(assignedTypeId) : undefined;
      return `Solve this ${params.size ?? ""} ${label ?? "puzzle"}`.replace(/\s+/g, " ");
    }
  }
}

/**
 * An assigned mission's puzzle progress (0..1): 1 once completed, else the latest
 * snapshot's (clamped; 0 when never started). Null for the other kinds.
 */
export function assignedPuzzleProgress(
  kind: MissionKind,
  questionId: string | undefined,
  completed: boolean,
  latest: Map<string, number>
): number | null {
  if (kind !== "solve_assigned" || !questionId) return null;
  if (completed) return 1;
  return Math.min(1, Math.max(0, latest.get(questionId) ?? 0));
}

// --- DB --------------------------------------------------------------------

export interface MissionView {
  id: number;
  period: Period;
  slot: number;
  periodStart: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  kind: MissionKind;
  typeId: number | null;
  description: string;
  /** solve_assigned only: the puzzle to open. */
  questionId: string | null;
  questionTitle: string | null;
  size: SizeTag | null;
  progress: number;
  target: number;
  /**
   * solve_assigned only: how far the player has got on the puzzle, 0..1, from the
   * latest snapshot of any of their attempts on it (1 once completed; 0 if never
   * started), so a GIANT puzzle shows its real progress rather than 0 / 1.
   */
  puzzleProgress: number | null;
  completed: boolean;
  completedAt: string | null; // ISO UTC
}

const longParam = (name: string, v: number) => ({ name, value: { longValue: v } });
const strParam = (name: string, v: string) => ({ name, value: { stringValue: v } });

const DATETIME_FMT = "'%Y-%m-%d %H:%i:%s'";

async function loadOpenPuzzles(playerId: number): Promise<OpenPuzzle[]> {
  const result = await executeStatement(
    `SELECT pq.id, pq.puzzle_type AS type_id, pt.incubating, pq.difficulty,
            pq.width, pq.height,
            JSON_LENGTH(pq.canon_repr, '$.subboards') AS subboards,
            JSON_LENGTH(pq.canon_repr, '$.hints') AS hint_rows
     FROM puzzle_questions pq
     JOIN puzzle_types pt ON pt.id = pq.puzzle_type
     WHERE pq.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM player_attempt pa
         WHERE pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
       )`,
    [longParam("player", playerId)]
  );
  return result.records.map((r) => {
    const typeId = r.type_id as number;
    return {
      id: r.id as string,
      typeId,
      incubating: Boolean(Number(r.incubating)),
      difficulty: r.difficulty as number,
      size: sizeTag({
        puzzleType: typeId,
        width: (r.width as number | null) ?? null,
        height: (r.height as number | null) ?? null,
        subboards: (r.subboards as number | null) ?? null,
        hintRows: (r.hint_rows as number | null) ?? null,
      }),
    };
  });
}

async function selectMissions(playerId: number, windows: PeriodWindow[]) {
  const where = windows
    .map((w, i) => `(period = :p${i} AND period_start = :s${i})`)
    .join(" OR ");
  const params = windows.flatMap((w, i) => [strParam(`p${i}`, w.period), strParam(`s${i}`, w.periodStart)]);
  const result = await executeStatement(
    `SELECT id, period, slot, DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
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
    slot: r.slot as number,
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
 * The player's current day, week and month missions, generating the set of
 * any period that has none. `tz` is an IANA zone name (already validated).
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
    const open = await loadOpenPuzzles(playerId);
    let inserted = false;
    for (const w of missing) {
      for (const draft of generateMissions(w.period, open)) {
        // INSERT IGNORE: a concurrent request may have generated it already.
        await executeStatement(
          `INSERT IGNORE INTO player_mission
             (player, period, period_start, slot, window_start, window_end, kind, params, target)
           VALUES (:player, :period, :periodStart, :slot, :windowStart, :windowEnd, :kind, :params, :target)`,
          [
            longParam("player", playerId),
            strParam("period", w.period),
            strParam("periodStart", w.periodStart),
            longParam("slot", draft.slot),
            strParam("windowStart", toSqlDateTime(w.startUtc)),
            strParam("windowEnd", toSqlDateTime(w.endUtc)),
            strParam("kind", draft.kind),
            strParam("params", JSON.stringify(draft.params)),
            longParam("target", draft.target),
          ]
        );
        inserted = true;
      }
    }
    if (inserted) rows = await selectMissions(playerId, windows);
  }
  if (rows.length === 0) return [];

  const from = rows.map((r) => r.windowStart).sort()[0];
  const ends = rows.map((r) => r.windowEnd).sort();
  const to = ends[ends.length - 1];
  const assignedIds = [...new Set(rows.map((r) => r.params.questionId).filter((id): id is string => !!id))];
  const [solvesResult, typesResult, assignedResult, snapshotResult] = await Promise.all([
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
    assignedIds.length === 0
      ? Promise.resolve({ records: [] as Record<string, unknown>[] })
      : executeStatement(
          `SELECT id, puzzle_type, title FROM puzzle_questions WHERE id IN (${assignedIds.map((_, i) => `:q${i}`).join(", ")})`,
          assignedIds.map((id, i) => strParam(`q${i}`, id))
        ),
    // The latest snapshot's progress on each assigned puzzle, across all attempts.
    assignedIds.length === 0
      ? Promise.resolve({ records: [] as Record<string, unknown>[] })
      : executeStatement(
          `SELECT question, progress FROM (
             SELECT pa.question, s.progress,
                    ROW_NUMBER() OVER (PARTITION BY pa.question ORDER BY s.created_at DESC) AS rn
             FROM player_attempt pa
             JOIN player_attempt_snapshot s ON s.attempt = pa.id
             WHERE pa.player = :player AND pa.question IN (${assignedIds.map((_, i) => `:q${i}`).join(", ")})
           ) latest
           WHERE rn = 1`,
          [longParam("player", playerId), ...assignedIds.map((id, i) => strParam(`q${i}`, id))]
        ),
  ]);
  const allSolves: WindowSolve[] = solvesResult.records.map((r) => ({
    question: r.question as string,
    typeId: r.type_id as number,
    difficulty: r.difficulty as number,
    finishedAt: r.finished_at as string,
  }));
  const typeLabels = new Map(typesResult.records.map((r) => [r.id as number, r.jp_label as string]));
  const assigned = new Map(
    assignedResult.records.map((r) => [
      r.id as string,
      { typeId: r.puzzle_type as number, title: (r.title as string | null) ?? null },
    ])
  );

  const latestProgress = new Map(
    snapshotResult.records.map((r) => [r.question as string, Number(r.progress) || 0])
  );

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
    const q = r.params.questionId ? assigned.get(r.params.questionId) : undefined;
    views.push({
      id: r.id,
      period: r.period,
      slot: r.slot,
      periodStart: r.periodStart,
      startsAt: sqlDateTimeToIso(r.windowStart),
      endsAt: sqlDateTimeToIso(r.windowEnd),
      kind: r.kind,
      typeId: r.params.typeId ?? q?.typeId ?? null,
      description: describeMission(r.kind, r.params, r.target, typeLabels, q?.typeId),
      questionId: r.params.questionId ?? null,
      questionTitle: q?.title ?? null,
      size: r.params.size ?? null,
      progress: completedAt ? r.target : progress,
      target: r.target,
      puzzleProgress: assignedPuzzleProgress(r.kind, r.params.questionId, completedAt !== null, latestProgress),
      completed: completedAt !== null,
      completedAt: completedAt ? sqlDateTimeToIso(completedAt) : null,
    });
  }
  views.sort((a, b) => PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period) || a.slot - b.slot);
  return views;
}
