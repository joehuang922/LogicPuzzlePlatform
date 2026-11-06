import { describe, expect, it } from "vitest";
import { PuzzleDefinition } from "../types/puzzle";
import { matchesSolution } from "./solutionCheck";

function puzzle(puzzleType: number, canonRepr: Record<string, unknown>, solutionRepr: unknown): PuzzleDefinition {
  return {
    id: "p",
    puzzleType,
    puzzleTypeName: "",
    puzzleTypeJpLabel: "",
    title: null,
    author: null,
    difficulty: 1,
    width: null,
    height: null,
    canonRepr,
    srcCollectionName: null,
    srcCollectionCoverSrc: null,
    solutionRepr: solutionRepr as Record<string, unknown> | null,
  };
}

/** A valid filled 9x9 sudoku, shifted by `shift` columns' worth of pattern. */
const sudokuGrid = (shift = 0) =>
  Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => ((3 * r + Math.floor(r / 3) + c + shift) % 9) + 1));

describe("matchesSolution", () => {
  it("is null without a stored solution or for a type with no check", () => {
    expect(matchesSolution(puzzle(1, { hints: [] }, null), {})).toBeNull();
    expect(matchesSolution(puzzle(3, {}, { cells: [] }), {})).toBeNull();
  });

  it("is null when the solution's shape doesn't fit the puzzle", () => {
    expect(matchesSolution(puzzle(1, {}, { hints: [[1, 2]] }), {})).toBeNull();
    expect(matchesSolution(puzzle(6, { rowClues: [[1]], colClues: [[1], [0]] }, { cells: [[1]] }), {})).toBeNull();
  });

  it("sudoku: digits must match, notes are ignored, the string form parses", () => {
    const sol = sudokuGrid();
    const p = puzzle(1, { hints: [] }, JSON.stringify({ hints: sol }));
    expect(matchesSolution(p, {})).toBe(true);
    expect(matchesSolution(p, { "3,1": sol[1][3], "n:0,0:5": 1 })).toBe(true);
    expect(matchesSolution(p, { "3,1": (sol[1][3] % 9) + 1 })).toBe(false);
    expect(matchesSolution(p, { "3,1": 0 })).toBe(true); // a cleared cell is no mark
  });

  it("combo sudoku: a global cell is checked against the board covering it", () => {
    // Boards at (0,0) and (2,2) sharing one room, both cut from one global pattern so
    // the shared cells agree (the check compares digits; it doesn't re-validate).
    const global = (c: number, r: number) => ((3 * r + Math.floor(r / 3) + c) % 9) + 1;
    const board = (x: number, y: number) => ({
      x,
      y,
      answers: Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => global(3 * x + c, 3 * y + r))),
    });
    const canon = { subboards: [{ x: 0, y: 0 }, { x: 2, y: 2 }] };
    const p = puzzle(2, canon, { subboards: [board(0, 0), board(2, 2)] });
    expect(matchesSolution(p, { "14,14": global(14, 14), "7,7": global(7, 7) })).toBe(true);
    expect(matchesSolution(p, { "14,14": (global(14, 14) % 9) + 1 })).toBe(false);
    // A solution whose boards don't match the canon's is no check.
    expect(matchesSolution(puzzle(2, canon, { subboards: [board(0, 0)] }), {})).toBeNull();
  });

  it("kakuro: digits on white cells", () => {
    const p = puzzle(12, { cells: [[{}, {}], [{}, {}]] }, { values: [[0, 0], [0, 7]] });
    expect(matchesSolution(p, { "1,1": 7 })).toBe(true);
    expect(matchesSolution(p, { "1,1": 8 })).toBe(false);
  });

  it("nonogram: a fill must be filled there, a cross must be empty", () => {
    const p = puzzle(6, { rowClues: [[1], [1]], colClues: [[1], [1]] }, { cells: [[1, 0], [0, 1]] });
    expect(matchesSolution(p, { "0,0": 1, "1,0": 2 })).toBe(true);
    expect(matchesSolution(p, { "1,0": 1 })).toBe(false);
    expect(matchesSolution(p, { "0,0": 2 })).toBe(false);
  });

  it("LITS: shaded cells and marked-unshaded cells", () => {
    // 2 rows x 3 cols: h is 1 x 3, v is 2 x 2.
    const canon = { grids: { h: [[0, 0, 0]], v: [[0, 0], [0, 0]] } };
    const p = puzzle(15, canon, { shaded: [[1, 1, 0], [0, 1, 1]] });
    expect(matchesSolution(p, { "c:1,0": 1, "c:2,0": 2 })).toBe(true);
    expect(matchesSolution(p, { "c:2,0": 1 })).toBe(false);
    expect(matchesSolution(p, { "c:0,0": 2 })).toBe(false);
  });

  it("slitherlink: lines and crosses on both edge grids", () => {
    // One cell: its loop is all four edges.
    const p = puzzle(5, { cells: [[4]] }, { edges: { h: [[1], [1]], v: [[1, 1]] } });
    expect(matchesSolution(p, { "h:0,0": 1, "v:0,1": 1 })).toBe(true);
    expect(matchesSolution(p, { "v:0,0": 2 })).toBe(false);
  });
});
