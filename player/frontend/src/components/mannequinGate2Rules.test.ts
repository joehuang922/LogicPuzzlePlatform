import { describe, it, expect } from "vitest";
import {
  badLines, crossingPairs, formatProblems, gateSize, linesWithTwo, statesFromValues,
  validateMannequinGate2, whitesConnected, warnings,
} from "./mannequinGate2Rules";
import { MannequinGate2Canon } from "../types/canon";

// The rule sheet example and puzzles 1-4, each with its unique solution (checked with CP-SAT).
const BOARDS: { name: string; canon: MannequinGate2Canon; solution: number[][] }[] = [
  { name: "example", canon: {"rows": 4, "cols": 4, "lines": [[[0, 0], [1, 0], [2, 0], [3, 0]], [[1, 0], [1, 1]], [[3, 0], [2, 1], [1, 2], [2, 3]], [[3, 1], [3, 2], [2, 2]], [[0, 3], [1, 3], [2, 3], [3, 3]]]}, solution: [[0, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 1], [1, 1, 1, 1]] },
  { name: "board1", canon: {"rows": 4, "cols": 4, "lines": [[[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 1], [0, 2], [0, 3]], [[0, 3], [1, 3], [2, 2], [3, 1]], [[2, 2], [3, 3]], [[3, 0], [3, 1], [3, 2], [2, 3]]]}, solution: [[1, 1, 0, 1], [0, 0, 0, 0], [1, 0, 1, 1], [1, 0, 0, 1]] },
  { name: "board2", canon: {"rows": 4, "cols": 4, "lines": [[[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 1], [1, 0], [2, 1]], [[1, 1], [2, 0], [3, 1]], [[3, 1], [3, 2], [3, 3]], [[0, 2], [1, 2], [1, 3]], [[0, 3], [1, 3], [2, 3]]]}, solution: [[1, 1, 1, 1], [0, 0, 0, 1], [1, 1, 0, 0], [1, 1, 0, 1]] },
  { name: "board3", canon: {"rows": 8, "cols": 8, "lines": [[[1, 1], [0, 1], [0, 2]], [[0, 2], [1, 2]], [[0, 3], [1, 3], [1, 4]], [[0, 4], [0, 5], [0, 6], [0, 7]], [[0, 7], [1, 6]], [[1, 6], [2, 6], [2, 7], [1, 7]], [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5]], [[2, 0], [3, 0], [3, 1]], [[4, 5], [3, 6], [3, 7]], [[3, 5], [4, 6], [5, 5], [5, 6], [4, 7]], [[6, 5], [7, 6]], [[6, 6], [7, 7], [7, 6], [7, 5]], [[4, 0], [4, 1]], [[4, 1], [5, 1], [6, 1], [7, 1]], [[4, 2], [5, 2], [5, 1]], [[5, 0], [6, 0], [7, 0]], [[7, 0], [7, 1]], [[4, 4], [4, 3], [5, 3], [6, 3], [7, 3], [7, 2]], [[5, 4], [6, 4], [6, 3], [6, 2]]]}, solution: [[0, 0, 1, 1, 1, 0, 0, 1], [0, 1, 1, 1, 0, 0, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0], [1, 1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 0, 1, 1, 0, 0], [1, 0, 1, 0, 1, 1, 1, 0], [0, 0, 0, 0, 1, 1, 1, 0], [1, 1, 1, 0, 0, 0, 1, 0]] },
  { name: "board4", canon: {"rows": 6, "cols": 6, "lines": [[[0, 0], [0, 1], [0, 2]], [[1, 0], [1, 1]], [[0, 4], [1, 4], [0, 3], [1, 2], [2, 2]], [[2, 1], [3, 2], [4, 2]], [[2, 2], [3, 1], [4, 0], [4, 1]], [[1, 3], [2, 3], [2, 4], [2, 5]], [[1, 5], [2, 4], [3, 3]], [[3, 4], [4, 4], [5, 5]], [[4, 5], [5, 4]]]}, solution: [[1, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1], [0, 0, 0, 0, 0, 1], [0, 1, 1, 1, 1, 1], [0, 1, 1, 0, 0, 1], [0, 0, 0, 0, 1, 1]] },
];

describe("Mannequin Gate 2 rules", () => {
  for (const b of BOARDS) {
    it(`accepts the solution of ${b.name}`, () => {
      expect(formatProblems(b.canon)).toEqual([]);
      expect(validateMannequinGate2(b.canon, b.solution)).toBe(true);
      expect(badLines(b.canon, b.solution).size).toBe(0);
      expect(linesWithTwo(b.canon, b.solution)).toBe(b.canon.lines.length);
    });

    it(`rejects ${b.name} with one cell flipped`, () => {
      for (let r = 0; r < b.canon.rows; r++) {
        for (let c = 0; c < b.canon.cols; c++) {
          const s = b.solution.map((row) => [...row]);
          s[r][c] = 1 - s[r][c];
          expect(validateMannequinGate2(b.canon, s)).toBe(false);
        }
      }
    });
  }

  it("matches the printed example answer and its gate sizes", () => {
    const ex = BOARDS[0];
    expect(ex.solution).toEqual([[0, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 1], [1, 1, 1, 1]]);
    expect(ex.canon.lines.map((l) => gateSize(l, ex.solution))).toEqual([1, 0, 2, 0, 0]);
  });

  it("counts crossings at shared cells and at diagonal corners only", () => {
    // Lines 0 and 1 cross only at a corner; 2 and 3 share cells with both; 4 touches neither.
    const lines = [
      [[0, 0], [1, 1]],
      [[0, 1], [1, 0]],
      [[0, 0], [0, 1]],
      [[1, 0], [1, 1]],
      [[2, 0], [2, 1]],
    ];
    expect(crossingPairs(lines)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3]]);
    // Parallel diagonals don't cross.
    expect(crossingPairs([[[0, 0], [1, 1]], [[0, 1], [1, 2]]])).toEqual([]);
  });

  it("flags broken lines for Errors on", () => {
    const canon: MannequinGate2Canon = { rows: 2, cols: 3, lines: [[[0, 0], [0, 1], [0, 2]], [[0, 1], [1, 1]]] };
    // Three shaded on line 0.
    expect([...badLines(canon, [[1, 1, 1], [0, 0, 0]])]).toEqual([0]);
    // Line 1 fully decided with one shaded.
    expect([...badLines(canon, [[0, 2, 0], [0, 1, 0]])]).toEqual([1]);
    // Crossing lines both with gate 0.
    expect([...badLines(canon, [[1, 1, 0], [0, 1, 0]])].sort()).toEqual([0, 1]);
  });

  it("needs the unshaded cells connected", () => {
    expect(whitesConnected([[0, 1, 0]])).toBe(false);
    expect(whitesConnected([[0, 2, 0]])).toBe(true);
    expect(whitesConnected([[1]])).toBe(false);
  });

  it("reads states from userValues", () => {
    expect(statesFromValues(2, 2, { "c:1,0": 1, "c:0,1": 2, "c:5,5": 1, "x:0,0": 1 })).toEqual([[0, 1], [2, 0]]);
  });

  it("lists format problems", () => {
    const canon: MannequinGate2Canon = {
      rows: 3,
      cols: 3,
      lines: [[[0, 0]], [[0, 0], [2, 2]], [[0, 0], [0, 1], [0, 0]], [[1, 0], [1, 1]], [[1, 1], [1, 0]], [[2, 2], [3, 2]]],
    };
    expect(formatProblems(canon)).toEqual([
      "Line 1 has fewer than 2 cells",
      "Line 2: R1C1 and R3C3 aren't neighbours",
      "Line 3 visits R1C1 twice",
      "Lines 4 and 5 share the step R2C2–R2C1",
      "Line 6: R4C3 is off the board",
    ]);
    expect(warnings({ rows: 1, cols: 1, lines: [] })).toEqual(["No lines"]);
  });
});
