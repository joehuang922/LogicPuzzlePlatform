import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { NonogramModel, solveLine } from "./model";
import {
  canonFromGrid,
  isValidSolution,
  lineClue,
  randomGrid,
  SMALL,
  MEDIUM,
  MULTIPLE,
  NONE_TOTALS,
  NONE_LINES,
} from "./fixtures";

const model = (canon = SMALL) => NonogramModel.fromCanon(canon);

const U = -1; // unknown cell, for readable line-solver cases

/**
 * Brute-force reference line solver: enumerate every 0/1 line agreeing with the known
 * cells, keep those whose clue matches, and intersect them. Exponential, so only for
 * short lines — it exists to cross-check the DP.
 */
function bruteLine(cells: number[], blocks: number[]): number[] | null {
  const n = cells.length;
  const want = JSON.stringify(blocks.length > 0 ? blocks : [0]);
  let canFill = 0;
  let canEmpty = 0;
  let any = false;
  for (let mask = 0; mask < 1 << n; mask++) {
    const line = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
    if (line.some((v, i) => cells[i] !== U && cells[i] !== v)) continue;
    if (JSON.stringify(lineClue(line)) !== want) continue;
    any = true;
    canFill |= mask;
    canEmpty |= ~mask;
  }
  if (!any) return null;
  return Array.from({ length: n }, (_, i) => {
    const f = (canFill >> i) & 1;
    const e = (canEmpty >> i) & 1;
    return f && e ? U : f ? 1 : 0;
  });
}

describe("line solver — solveLine()", () => {
  it("fills the overlap of a block longer than half the line", () => {
    // [8] in 10 cells: wherever it sits, cells 2..7 are covered.
    expect(solveLine(Array(10).fill(U), [8])).toEqual([U, U, 1, 1, 1, 1, 1, 1, U, U]);
  });

  it("settles a line whose blocks exactly fill it", () => {
    expect(solveLine(Array(7).fill(U), [3, 3])).toEqual([1, 1, 1, 0, 1, 1, 1]);
  });

  it("empties a [0] line (normalized to no blocks)", () => {
    expect(solveLine(Array(4).fill(U), [])).toEqual([0, 0, 0, 0]);
  });

  it("anchors a block to a filled edge cell", () => {
    expect(solveLine([1, U, U, U, U, U], [3])).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("returns null when the known cells contradict the clue", () => {
    expect(solveLine([U, 1, U], [])).toBeNull();
    expect(solveLine([1, 1, 1, U], [2])).toBeNull();
    expect(solveLine(Array(4).fill(U), [2, 2])).toBeNull(); // needs 5 cells
  });

  it("agrees with brute force on random short lines", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 3000; trial++) {
      const n = 1 + Math.floor(rnd() * 10);
      // Clue from a random line; then reveal some cells — of that line (consistent) or
      // random (often contradictory), to exercise both outcomes.
      const truth = Array.from({ length: n }, () => (rnd() < 0.55 ? 1 : 0));
      const blocks = lineClue(truth).filter((b) => b > 0);
      const honest = rnd() < 0.6;
      const cells = truth.map((v) => (rnd() < 0.3 ? (honest ? v : rnd() < 0.5 ? 1 : 0) : U));
      expect(solveLine(cells, blocks)).toEqual(bruteLine(cells, blocks));
    }
  });
});

describe("registration gate — classify()", () => {
  it("classifies the 10x10 sample board as 'unique'", () => {
    expect(classify(model(SMALL))).toBe("unique");
  });

  it("classifies the 25x25 sample board as 'unique'", () => {
    expect(classify(model(MEDIUM))).toBe("unique");
  });

  it("classifies a board with two diagonal solutions as 'multiple'", () => {
    expect(classify(model(MULTIPLE))).toBe("multiple");
  });

  it("classifies mismatched row/column totals as 'none' without searching", () => {
    expect(model(NONE_TOTALS).isDead()).toBe(true);
    expect(classify(model(NONE_TOTALS))).toBe("none");
  });

  it("classifies conflicting lines with matching totals as 'none'", () => {
    expect(classify(model(NONE_LINES))).toBe("none");
  });

  it("flags a misread clue on a real board instead of accepting it", () => {
    // Swapping two groups in one row keeps every total intact; the clues no longer
    // describe a picture, so the board must not come back 'unique' with a wrong answer.
    const misread = JSON.parse(JSON.stringify(MEDIUM));
    misread.rowClues[0] = [5, 18];
    expect(classify(model(misread))).toBe("none");
  });
});

describe("uniqueness proof — countSolutions()", () => {
  it("returns exactly 1 for the unique puzzle", () => {
    expect(countSolutions(model(SMALL), 2)).toBe(1);
  });

  it("returns >= 2 for the ambiguous puzzle", () => {
    expect(countSolutions(model(MULTIPLE), 2)).toBe(2);
  });

  it("returns 0 for the unsatisfiable puzzle", () => {
    expect(countSolutions(model(NONE_LINES), 2)).toBe(0);
  });
});

describe("solution extraction — solve()", () => {
  it("yields the 10x10 sample's picture, independently rule-valid", () => {
    const grid = solve(model(SMALL));
    expect(grid).not.toBeNull();
    expect(isValidSolution(SMALL, grid!)).toBe(true);
    expect(grid).toEqual([
      [1, 1, 0, 1, 0, 0, 1, 0, 1, 1],
      [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
      [1, 1, 1, 0, 1, 1, 0, 1, 1, 1],
      [0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
      [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
      [1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
      [1, 1, 1, 0, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ]);
  });

  it("yields a rule-valid grid for the 25x25 sample board", () => {
    const grid = solve(model(MEDIUM));
    expect(grid).not.toBeNull();
    expect(isValidSolution(MEDIUM, grid!)).toBe(true);
  });

  it("produces a rule-valid grid for an ambiguous board (any one solution)", () => {
    const grid = solve(model(MULTIPLE));
    expect(grid).not.toBeNull();
    expect(isValidSolution(MULTIPLE, grid!)).toBe(true);
  });

  it("returns null when there is no solution", () => {
    expect(solve(model(NONE_LINES))).toBeNull();
  });
});

describe("boards derived from pictures", () => {
  // Clues taken from a picture always admit that picture, so the verdict is never 'none',
  // and a 'unique' verdict must reproduce the picture exactly.
  it("never misjudges random 12x12 pictures", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const picture = randomGrid(seed, 12, 12, 0.55);
      const canon = canonFromGrid(picture);
      const verdict = classify(model(canon));
      expect(verdict).not.toBe("none");
      const grid = solve(model(canon))!;
      expect(isValidSolution(canon, grid)).toBe(true);
      if (verdict === "unique") expect(grid).toEqual(picture);
    }
  });

  it("solves a 35x35 picture (the largest sample board's size) within the gate budget", () => {
    // Seed 5 at 60% fill yields a uniquely solvable 35x35 board.
    const picture = randomGrid(5, 35, 35, 0.6);
    const canon = canonFromGrid(picture);
    const budget = { deadline: Date.now() + 10_000 };
    expect(classify(model(canon), budget)).toBe("unique");
    expect(solve(model(canon), budget)).toEqual(picture);
  });
});
