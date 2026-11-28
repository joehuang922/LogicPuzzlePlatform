import { executeStatement } from "./db";
import {
  DATETIME_FMT,
  evaluateMission,
  longParam,
  MissionKind,
  MissionParams,
  Period,
  strParam,
  WindowSolve,
} from "./missions";
import { SizeTag, sizeTag } from "./sizeTag";

/**
 * XP and levels. Nothing is stored: XP is counted from what the player has
 * done, like mission progress.
 * - Each solved puzzle (counted once, however often it's replayed) earns
 *   solve XP by difficulty, times its size (BIG x3, GIANT x6). Solve XP also
 *   goes to that puzzle type's mastery.
 * - Each completed mission earns XP by period, and completing every mission
 *   of a period earns a set bonus. Mission XP counts toward the overall level
 *   only.
 * The overall level and each type's mastery level sit on the same curve
 * shape: going from level n to n+1 costs round(scale * n^1.5).
 * Changing a number here re-levels everyone, past solves included.
 */

export const SOLVE_XP: Record<number, number> = { 1: 10, 2: 15, 3: 25, 4: 40, 5: 60 };
export const SIZE_MULTIPLIER: Record<SizeTag, number> = { BIG: 3, GIANT: 6 };
export const MISSION_XP: Record<Period, number> = { day: 25, week: 100, month: 300 };
export const SET_BONUS_XP: Record<Period, number> = { day: 50, week: 150, month: 300 };
export const LEVEL_SCALE = 100;
export const MASTERY_SCALE = 50;

export function solveXp(difficulty: number, size: SizeTag | null): number {
  const base = SOLVE_XP[difficulty] ?? SOLVE_XP[3];
  return base * (size ? SIZE_MULTIPLIER[size] : 1);
}

/** XP needed to go from `level` to `level + 1`. */
export function levelCost(level: number, scale: number): number {
  return Math.round(scale * Math.pow(level, 1.5));
}

export interface LevelProgress {
  level: number;
  /** Total XP at which this level started and the next one starts. */
  levelStartXp: number;
  nextLevelXp: number;
}

/** The level reached with `xp` in total; everyone starts at level 1. */
export function levelFor(xp: number, scale: number): LevelProgress {
  let level = 1;
  let start = 0;
  for (;;) {
    const next = start + levelCost(level, scale);
    if (xp < next) return { level, levelStartXp: start, nextLevelXp: next };
    start = next;
    level++;
  }
}

// --- Counting ---------------------------------------------------------------

/** A puzzle the player has solved at least once. */
export interface SolvedPuzzle {
  typeId: number;
  difficulty: number;
  size: SizeTag | null;
}

export interface MissionRecord {
  period: Period;
  periodStart: string;
  completed: boolean;
}

export interface TypeMastery extends LevelProgress {
  typeId: number;
  xp: number;
  solved: number;
}

export interface XpSummary extends LevelProgress {
  total: number;
  fromSolves: number;
  fromMissions: number;
  fromSetBonuses: number;
  /** Types with at least one solve, most XP first. */
  mastery: TypeMastery[];
}

export function summarizeXp(solved: SolvedPuzzle[], missions: MissionRecord[]): XpSummary {
  let fromSolves = 0;
  const byType = new Map<number, { xp: number; solved: number }>();
  for (const p of solved) {
    const xp = solveXp(p.difficulty, p.size);
    fromSolves += xp;
    const t = byType.get(p.typeId) ?? { xp: 0, solved: 0 };
    t.xp += xp;
    t.solved++;
    byType.set(p.typeId, t);
  }

  let fromMissions = 0;
  const sets = new Map<string, { period: Period; all: boolean }>();
  for (const m of missions) {
    if (m.completed) fromMissions += MISSION_XP[m.period];
    const key = `${m.period}/${m.periodStart}`;
    const set = sets.get(key) ?? { period: m.period, all: true };
    set.all &&= m.completed;
    sets.set(key, set);
  }
  let fromSetBonuses = 0;
  for (const s of sets.values()) if (s.all) fromSetBonuses += SET_BONUS_XP[s.period];

  const total = fromSolves + fromMissions + fromSetBonuses;
  const mastery = [...byType.entries()]
    .map(([typeId, t]) => ({ typeId, ...t, ...levelFor(t.xp, MASTERY_SCALE) }))
    .sort((a, b) => b.xp - a.xp || a.typeId - b.typeId);
  return { total, fromSolves, fromMissions, fromSetBonuses, ...levelFor(total, LEVEL_SCALE), mastery };
}

/** A finish of a question; replays included. */
export type Finish = WindowSolve;

/** Missions count a question's first finish inside their window. */
export function solvesInWindow(finishes: Finish[], start: string, end: string): WindowSolve[] {
  const first = new Map<string, WindowSolve>();
  for (const f of finishes) {
    if (f.finishedAt < start || f.finishedAt >= end) continue;
    const prev = first.get(f.question);
    if (!prev || f.finishedAt < prev.finishedAt) first.set(f.question, f);
  }
  return [...first.values()];
}

// --- DB ---------------------------------------------------------------------

export interface XpView extends XpSummary {
  mastery: (TypeMastery & { label: string })[];
  rewards: { mission: Record<Period, number>; setBonus: Record<Period, number> };
}

export async function getPlayerXp(playerId: number): Promise<XpView> {
  const player = longParam("player", playerId);
  const [solvedResult, missionResult, typesResult] = await Promise.all([
    executeStatement(
      `SELECT pq.puzzle_type AS type_id, pq.difficulty, pq.width, pq.height,
              JSON_LENGTH(pq.canon_repr, '$.subboards') AS subboards,
              JSON_LENGTH(pq.canon_repr, '$.hints') AS hint_rows
       FROM puzzle_questions pq
       WHERE EXISTS (
         SELECT 1 FROM player_attempt pa
         WHERE pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
       )`,
      [player]
    ),
    executeStatement(
      `SELECT id, period, DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
              DATE_FORMAT(window_start, ${DATETIME_FMT}) AS window_start,
              DATE_FORMAT(window_end, ${DATETIME_FMT}) AS window_end,
              kind, params, target, completed_at IS NOT NULL AS completed
       FROM player_mission WHERE player = :player`,
      [player]
    ),
    executeStatement(`SELECT id, jp_label FROM puzzle_types`),
  ]);

  const solved: SolvedPuzzle[] = solvedResult.records.map((r) => {
    const typeId = r.type_id as number;
    return {
      typeId,
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

  const rows = missionResult.records.map((r) => ({
    id: r.id as number,
    period: r.period as Period,
    periodStart: r.period_start as string,
    windowStart: r.window_start as string,
    windowEnd: r.window_end as string,
    kind: r.kind as MissionKind,
    params: JSON.parse((r.params as string) || "{}") as MissionParams,
    target: r.target as number,
    completed: Boolean(Number(r.completed)),
  }));

  // completed_at is stamped when the Profile shows a mission; one finished
  // in a period the player never looked at is settled here.
  const open = rows.filter((r) => !r.completed);
  if (open.length > 0) {
    const from = open.map((r) => r.windowStart).sort()[0];
    const finishesResult = await executeStatement(
      `SELECT pa.question, pq.puzzle_type AS type_id, pq.difficulty,
              DATE_FORMAT(pa.finished_at, ${DATETIME_FMT}) AS finished_at
       FROM player_attempt pa
       JOIN puzzle_questions pq ON pq.id = pa.question
       WHERE pa.player = :player AND pa.finished_at >= :from`,
      [player, strParam("from", from)]
    );
    const finishes: Finish[] = finishesResult.records.map((r) => ({
      question: r.question as string,
      typeId: r.type_id as number,
      difficulty: r.difficulty as number,
      finishedAt: r.finished_at as string,
    }));
    for (const r of open) {
      const { completedAt } = evaluateMission(r, solvesInWindow(finishes, r.windowStart, r.windowEnd));
      if (!completedAt) continue;
      r.completed = true;
      await executeStatement(
        `UPDATE player_mission SET completed_at = :completedAt WHERE id = :id AND completed_at IS NULL`,
        [strParam("completedAt", completedAt), longParam("id", r.id)]
      );
    }
  }

  const summary = summarizeXp(solved, rows);
  const labels = new Map(typesResult.records.map((r) => [r.id as number, r.jp_label as string]));
  return {
    ...summary,
    mastery: summary.mastery.map((m) => ({ ...m, label: labels.get(m.typeId) ?? `Type ${m.typeId}` })),
    rewards: { mission: MISSION_XP, setBonus: SET_BONUS_XP },
  };
}

