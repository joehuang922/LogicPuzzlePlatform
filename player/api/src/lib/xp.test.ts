import { describe, expect, it } from "vitest";
import { levelCost, levelFor, solvesInWindow, solveXp, summarizeXp } from "./xp";

describe("solveXp", () => {
  it("scales by difficulty and size", () => {
    expect(solveXp(1, null)).toBe(10);
    expect(solveXp(4, null)).toBe(40);
    expect(solveXp(4, "BIG")).toBe(120);
    expect(solveXp(5, "GIANT")).toBe(360);
  });
});

describe("levelFor", () => {
  it("starts at level 1 and costs round(scale * n^1.5) per level", () => {
    expect(levelCost(1, 100)).toBe(100);
    expect(levelCost(4, 100)).toBe(800);
    expect(levelFor(0, 100)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 100 });
    expect(levelFor(99, 100).level).toBe(1);
    expect(levelFor(100, 100)).toEqual({ level: 2, levelStartXp: 100, nextLevelXp: 383 });
    expect(levelFor(383, 100).level).toBe(3);
  });
});

describe("summarizeXp", () => {
  it("adds solve XP per type, mission XP and full-set bonuses", () => {
    const s = summarizeXp(
      [
        { typeId: 6, difficulty: 3, size: "BIG" },
        { typeId: 6, difficulty: 1, size: null },
        { typeId: 2, difficulty: 4, size: null },
      ],
      [
        { period: "day", periodStart: "2026-11-27", completed: true },
        { period: "day", periodStart: "2026-11-27", completed: true },
        { period: "day", periodStart: "2026-11-28", completed: true },
        { period: "day", periodStart: "2026-11-28", completed: false },
        { period: "week", periodStart: "2026-11-23", completed: true },
      ]
    );
    expect(s.fromSolves).toBe(75 + 10 + 40);
    expect(s.fromMissions).toBe(3 * 25 + 100);
    expect(s.fromSetBonuses).toBe(50 + 150);
    expect(s.total).toBe(125 + 175 + 200);
    expect(s.level).toBe(3);
    expect(s.mastery.map((m) => [m.typeId, m.xp, m.solved, m.level])).toEqual([
      [6, 85, 2, 2],
      [2, 40, 1, 1],
    ]);
  });

  it("is level 1 with nothing done", () => {
    expect(summarizeXp([], [])).toMatchObject({ total: 0, level: 1, mastery: [] });
  });
});

describe("solvesInWindow", () => {
  it("keeps each question's first finish inside the window", () => {
    const f = (question: string, finishedAt: string) => ({ question, typeId: 1, difficulty: 3, finishedAt });
    const got = solvesInWindow(
      [f("a", "2026-11-01 10:00:00"), f("a", "2026-11-02 09:00:00"), f("a", "2026-11-02 08:00:00"), f("b", "2026-11-03 00:00:00")],
      "2026-11-02 00:00:00",
      "2026-11-03 00:00:00"
    );
    expect(got).toEqual([f("a", "2026-11-02 08:00:00")]);
  });
});
