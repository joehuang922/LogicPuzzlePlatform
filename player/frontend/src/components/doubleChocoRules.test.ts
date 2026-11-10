import { describe, expect, it } from "vitest";
import { validateSolution } from "./doubleChocoRules";
import { computeDoubleChocoProgress } from "../progress/doubleChoco";
import { PuzzleDefinition } from "../types/puzzle";

// 2x4 board, two 2x2 rooms (W = white, G = gray, clue 2 on (0,0)):
//   W2 G | W W
//   W  G | G G
const cells: [number, number][][] = [
  [[0, 2], [1, 0], [0, 0], [0, 0]],
  [[0, 0], [1, 0], [1, 0], [1, 0]],
];
const puzzle = { canonRepr: { cells } } as unknown as PuzzleDefinition;
const solved = { "v:0,1": 1, "v:1,1": 1 };
const progress = (values: Record<string, number>) => computeDoubleChocoProgress.compute(puzzle, values);

describe("double choco progress", () => {
  it("is 0 on the undivided board even though it's balanced", () => {
    expect(progress({})).toBe(0);
  });
  it("counts only rooms that pass every rule", () => {
    expect(progress(solved)).toBe(100);
    // Right room split into an all-white and an all-gray half.
    expect(progress({ ...solved, "h:0,2": 1, "h:0,3": 1 })).toBe(50);
  });
  it("doesn't count a balanced room whose clue is wrong", () => {
    const wrong = cells.map((row) => row.map((cell) => [...cell] as [number, number]));
    wrong[0][0] = [0, 3];
    const p = { canonRepr: { cells: wrong } } as unknown as PuzzleDefinition;
    expect(computeDoubleChocoProgress.compute(p, solved)).toBe(50);
  });
});

describe("validateSolution", () => {
  it("accepts the solution and rejects a redundant border", () => {
    expect(validateSolution(cells, [[0, 0, 0, 0]], [[0, 1, 0], [0, 1, 0]])).toBe(true);
    expect(validateSolution(cells, [[1, 0, 0, 0]], [[0, 1, 0], [0, 1, 0]])).toBe(false);
  });
});
