import { describe, it, expect } from "vitest";
import { nextHint } from "../../hint";
import { solve } from "../../drivers";
import { CellValues, Step } from "../../types";
import { NonogramCanon, NonogramModel } from "./model";
import { nonogramRevealStep, NonogramBoard } from "./index";
import { NONOGRAM_TECHNIQUES } from "./techniques";
import { SMALL, MEDIUM, MULTIPLE, PROBE, PROBE_GRID, PROBE_STALLED } from "./fixtures";

const hint = (canon: NonogramCanon, values: CellValues = {}) => nextHint(6, canon, values);

/** Apply a step's placements to a "col,row" values map. */
function apply(values: CellValues, step: Step, cols: number): CellValues {
  const next = { ...values };
  for (const p of step.placements ?? []) next[`${p.cell % cols},${Math.floor(p.cell / cols)}`] = p.value;
  return next;
}

/** Follow hints from an empty board until none fires; returns the marks and techniques used. */
function playOut(canon: NonogramCanon) {
  const cols = canon.colClues.length;
  let values: CellValues = {};
  const used = new Set<string>();
  for (let guard = 0; guard < 10_000; guard++) {
    const step = hint(canon, values);
    if (!step) break;
    used.add(step.technique);
    expect(step.placements?.length).toBeGreaterThan(0);
    values = apply(values, step, cols);
  }
  return { values, used };
}

describe("nonogram hints", () => {
  it("points at a line that can be finished outright on an empty board", () => {
    // SMALL row 4 is [3, 2, 3]: 3+1+2+1+3 = 10 cells, so it has exactly one arrangement.
    const step = hint(SMALL)!;
    expect(step.technique).toBe("line-complete");
    expect(step.focusLines).toEqual([{ axis: "row", index: 3 }]);
    expect(step.placements).toHaveLength(10);
    const solution = solve(NonogramModel.fromCanon(SMALL))!;
    for (const p of step.placements!) {
      expect(p.value).toBe(solution[3][p.cell % 10] === 1 ? 1 : 2);
    }
  });

  it("flags a line whose marks can't fit its clue", () => {
    // Row 10 is [10]; a cross anywhere in it is a contradiction.
    const step = hint(SMALL, { "4,9": 2 })!;
    expect(step.technique).toBe("line-contradiction");
    expect(step.focusLines).toEqual([{ axis: "row", index: 9 }]);
    expect(step.placements).toBeUndefined();
  });

  it("overlap finds the cells every arrangement of a line agrees on", () => {
    // A single [3] in 5 cells: only the middle cell is certain.
    const canon = { rowClues: [[3]], colClues: [[0], [1], [1], [1], [0]] };
    const overlap = NONOGRAM_TECHNIQUES.find((t) => t.name === "line-overlap")!;
    const step = overlap.apply(NonogramBoard.build(canon, {}))!;
    expect(step.focusLines).toEqual([{ axis: "row", index: 0 }]);
    expect(step.placements).toEqual([{ cell: 2, value: 1 }]);
    expect(step.explanation).toMatch(/agrees on 1 more cell\./);
  });

  it("crosses out the rest of a line that already has its blocks", () => {
    const canon = { rowClues: [[1]], colClues: [[0], [1], [0]] };
    const step = hint(canon, { "1,0": 1 })!;
    expect(step.technique).toBe("line-empties");
    expect(step.focusLines).toEqual([{ axis: "row", index: 0 }]);
    expect(step.placements).toEqual([
      { cell: 0, value: 2 },
      { cell: 2, value: 2 },
    ]);
    expect(step.explanation).toMatch(/already has all its blocks/);
  });

  it("falls back to a row-and-column step once single lines stall", () => {
    const step = hint(PROBE, PROBE_STALLED)!;
    expect(step.technique).toBe("two-lines");
    expect(step.focusLines).toHaveLength(2);
    const [{ cell, value }] = step.placements!;
    expect(value).toBe(PROBE_GRID[Math.floor(cell / 6)][cell % 6] === 1 ? 1 : 2);
  });

  it.each([
    ["SMALL", SMALL],
    ["MEDIUM", MEDIUM],
    ["PROBE", PROBE],
  ])("solves %s by following hints, every placement correct", (_, canon) => {
    const solution = solve(NonogramModel.fromCanon(canon))!;
    const { values } = playOut(canon);
    solution.forEach((row, r) =>
      row.forEach((want, c) => expect(values[`${c},${r}`]).toBe(want === 1 ? 1 : 2))
    );
  });

  it("returns null when logic can't progress, and reveal fills in from the solution", () => {
    expect(hint(MULTIPLE)).toBeNull();
    const reveal = nonogramRevealStep(MULTIPLE, {}, [
      [1, 0],
      [0, 1],
    ])!;
    expect(reveal.technique).toBe("reveal");
    expect(reveal.placements).toEqual([{ cell: 0, value: 1 }]);
    expect(nonogramRevealStep(MULTIPLE, {}, null)).toBeNull();
  });

  it("returns null on a finished board", () => {
    const { values } = playOut(SMALL);
    expect(hint(SMALL, values)).toBeNull();
  });
});
