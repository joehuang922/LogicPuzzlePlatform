import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "./drivers";
import { SudokuModel } from "./plugins/sudoku";
import {
  parseGrid,
  isValidSolution,
  respectsHints,
  INKALA_HARDEST,
  SEVENTEEN_CLUE,
  CONTRADICTORY,
} from "./plugins/sudoku/fixtures";

const model = (s: string) => SudokuModel.fromCanon(parseGrid(s));

describe("registration gate — classify()", () => {
  it("classifies a hard unique puzzle as 'unique'", () => {
    expect(classify(model(INKALA_HARDEST))).toBe("unique");
  });

  it("classifies an intact 17-clue puzzle as 'unique'", () => {
    expect(classify(model(SEVENTEEN_CLUE))).toBe("unique");
  });

  it("classifies a puzzle with contradictory givens as 'none'", () => {
    expect(classify(model(CONTRADICTORY))).toBe("none");
  });

  it("classifies the empty grid as 'multiple'", () => {
    expect(classify(model("0".repeat(81)))).toBe("multiple");
  });
});

describe("uniqueness proof — countSolutions()", () => {
  it("returns exactly 1 for a unique puzzle", () => {
    expect(countSolutions(model(INKALA_HARDEST), 2)).toBe(1);
  });

  it("returns >=2 for a 16-clue variant (proven never unique)", () => {
    // Remove the first given from the 17-clue puzzle -> 16 clues.
    const stripped = SEVENTEEN_CLUE.replace("1", "0");
    expect(countSolutions(model(stripped), 2)).toBe(2);
  });

  it("returns 0 for an unsatisfiable puzzle", () => {
    expect(countSolutions(model(CONTRADICTORY), 2)).toBe(0);
  });

  it("respects the cap (never counts past it)", () => {
    expect(countSolutions(model("0".repeat(81)), 2)).toBe(2);
    expect(countSolutions(model("0".repeat(81)), 5)).toBe(5);
  });
});

describe("solution production — solve()", () => {
  it("solves the hardest puzzle into a legal grid that respects the givens", () => {
    const canon = parseGrid(INKALA_HARDEST);
    const grid = solve(SudokuModel.fromCanon(canon));
    expect(grid).not.toBeNull();
    expect(isValidSolution(grid!)).toBe(true);
    expect(respectsHints(canon, grid!)).toBe(true);
  });

  it("returns null for an unsatisfiable puzzle", () => {
    expect(solve(model(CONTRADICTORY))).toBeNull();
  });

  it("is fast on the hardest known puzzle (well under the Lambda budget)", () => {
    const t0 = performance.now();
    solve(model(INKALA_HARDEST));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
