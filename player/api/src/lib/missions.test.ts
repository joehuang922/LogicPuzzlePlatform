import { describe, expect, it } from "vitest";
import { evaluateMission, generateMissions, OpenPuzzle, periodWindow, toSqlDateTime, WindowSolve } from "./missions";
import { sizeTag } from "./sizeTag";

const win = (w: ReturnType<typeof periodWindow>) => [w.periodStart, toSqlDateTime(w.startUtc), toSqlDateTime(w.endUtc)];

describe("periodWindow", () => {
  // Friday 04:00 in Taipei, still Thursday in UTC.
  const now = Date.parse("2026-11-26T20:00:00Z");

  it("uses the player's local day, Monday week and calendar month", () => {
    expect(win(periodWindow("day", now, "Asia/Taipei"))).toEqual(["2026-11-27", "2026-11-26 16:00:00", "2026-11-27 16:00:00"]);
    expect(win(periodWindow("week", now, "Asia/Taipei"))).toEqual(["2026-11-23", "2026-11-22 16:00:00", "2026-11-29 16:00:00"]);
    expect(win(periodWindow("month", now, "Asia/Taipei"))).toEqual(["2026-11-01", "2026-10-31 16:00:00", "2026-11-30 16:00:00"]);
    expect(win(periodWindow("day", now, "UTC"))).toEqual(["2026-11-26", "2026-11-26 00:00:00", "2026-11-27 00:00:00"]);
  });

  it("puts Sunday in the week that started the Monday before", () => {
    expect(periodWindow("week", Date.parse("2026-11-29T12:00:00Z"), "UTC").periodStart).toBe("2026-11-23");
  });

  it("follows a DST change inside the period", () => {
    const w = periodWindow("month", Date.parse("2026-03-15T12:00:00Z"), "America/New_York");
    expect(win(w)).toEqual(["2026-03-01", "2026-03-01 05:00:00", "2026-04-01 04:00:00"]);
  });
});

describe("sizeTag", () => {
  it("matches the web and Android size pills", () => {
    const t = (puzzleType: number, width: number | null, height: number | null, subboards: number | null = null, hintRows: number | null = null) =>
      sizeTag({ puzzleType, width, height, subboards, hintRows });
    expect(t(1, 16, 16)).toBe("BIG");
    expect(t(1, null, null, null, 25)).toBe("GIANT");
    expect(t(2, null, null, 20)).toBe("GIANT");
    expect(t(12, 42, 32)).toBe("GIANT");
    expect(t(6, 60, 50)).toBe("BIG");
    expect(t(6, 50, 99)).toBe("BIG");
    expect(t(6, 60, 90)).toBe("GIANT");
    expect(t(44, 240, 120)).toBe("GIANT");
    expect(t(5, 40, 30)).toBe("BIG");
    expect(t(5, 50, 40)).toBe("GIANT");
    expect(t(5, 10, 10)).toBeNull();
  });
});

describe("generateMissions", () => {
  let n = 0;
  const P = (typeId: number, difficulty: number, size: OpenPuzzle["size"] = null, incubating = false): OpenPuzzle =>
    ({ id: `q${n++}`, typeId, difficulty, size, incubating });
  const open = [
    P(1, 2), P(1, 4), P(3, 1), P(4, 5), P(5, 1, null, true),
    P(7, 2, "BIG"), P(8, 2, "BIG"), P(9, 2, "BIG"), P(10, 2, "BIG"),
    P(6, 3, "GIANT"), P(6, 3, "GIANT"), P(11, 3, "GIANT"),
  ];
  const repeat = (f: () => void) => { for (let i = 0; i < 50; i++) f(); };

  it("day: three distinct non-incubating types and one Hard+", () => repeat(() => {
    const d = generateMissions("day", open);
    expect(d.map((m) => [m.kind, m.target])).toEqual([["solve_type", 1], ["solve_type", 1], ["solve_type", 1], ["solve_hard", 1]]);
    const types = d.slice(0, 3).map((m) => m.params.typeId);
    expect(new Set(types).size).toBe(3);
    expect(types).not.toContain(5);
  }));

  it("week: 20 any and 10 Hard+ capped at what's open, three distinct BIG", () => repeat(() => {
    const w = generateMissions("week", open);
    expect(w.map((m) => [m.slot, m.kind, m.target])).toEqual([
      [0, "solve_count", 12], [1, "solve_hard", 2],
      [2, "solve_assigned", 1], [3, "solve_assigned", 1], [4, "solve_assigned", 1],
    ]);
    const big = w.slice(2);
    expect(new Set(big.map((m) => m.params.questionId)).size).toBe(3);
    expect(big.every((m) => m.params.size === "BIG")).toBe(true);
  }));

  it("month: a GIANT nonogram and another GIANT", () => repeat(() => {
    const ids = generateMissions("month", open).map((m) => m.params.questionId);
    expect(["q9", "q10"]).toContain(ids[0]);
    expect(ids[1]).toBe("q11");
  }));

  it("month: a BIG nonogram when no GIANT one is left", () => {
    const o = [P(6, 3, "BIG"), P(11, 3, "GIANT"), P(6, 3, null)];
    expect(generateMissions("month", o).map((m) => [m.params.questionId, m.params.size])).toEqual([[o[0].id, "BIG"], [o[1].id, "GIANT"]]);
  });

  it("month: two GIANT nonograms when nothing else is GIANT", () => {
    const o = [P(6, 3, "GIANT"), P(6, 3, "GIANT")];
    expect(generateMissions("month", o).map((m) => m.params.questionId).sort()).toEqual([o[0].id, o[1].id].sort());
  });

  it("nothing open, no missions", () => {
    expect(generateMissions("week", [])).toEqual([]);
  });
});

describe("evaluateMission", () => {
  const solves: WindowSolve[] = [
    { question: "a", typeId: 1, difficulty: 4, finishedAt: "2026-11-26 10:00:00" },
    { question: "b", typeId: 2, difficulty: 1, finishedAt: "2026-11-26 09:00:00" },
    { question: "c", typeId: 1, difficulty: 5, finishedAt: "2026-11-26 11:00:00" },
  ];

  it("completes at the finish time of the solve that reached the target", () => {
    expect(evaluateMission({ kind: "solve_count", params: {}, target: 2 }, solves)).toEqual({ progress: 2, completedAt: "2026-11-26 10:00:00" });
    expect(evaluateMission({ kind: "solve_hard", params: { minDifficulty: 4 }, target: 2 }, solves)).toEqual({ progress: 2, completedAt: "2026-11-26 11:00:00" });
    expect(evaluateMission({ kind: "solve_assigned", params: { questionId: "a" }, target: 1 }, solves)).toEqual({ progress: 1, completedAt: "2026-11-26 10:00:00" });
  });

  it("stays open below the target", () => {
    expect(evaluateMission({ kind: "solve_type", params: { typeId: 1 }, target: 3 }, solves)).toEqual({ progress: 2, completedAt: null });
    expect(evaluateMission({ kind: "solve_assigned", params: { questionId: "z" }, target: 1 }, solves)).toEqual({ progress: 0, completedAt: null });
    expect(evaluateMission({ kind: "solve_count", params: {}, target: 20 }, solves)).toEqual({ progress: 3, completedAt: null });
  });
});
