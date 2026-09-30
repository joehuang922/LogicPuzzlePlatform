import { describe, it, expect } from "vitest";
import { nextHint } from "./hint";
import { solve } from "./drivers";
import { SudokuModel } from "./plugins/sudoku";
import { parseGrid, INKALA_HARDEST } from "./plugins/sudoku/fixtures";
import { CellValues } from "./types";

const rc = (id: number) => `${id % 9},${Math.floor(id / 9)}`;

// A classic easy puzzle solvable entirely by singles (Norvig's example grid).
const EASY_SINGLES =
  "003020600900305001001806400008102900700000008006708200002609500800203009005010300";

describe("nextHint — no-support cases", () => {
  it("returns null for an unsupported puzzle type", () => {
    expect(nextHint(999, {}, {})).toBeNull();
  });
});

describe("nextHint — naked single (depth 0)", () => {
  it("finds the one empty cell forced by its peers", () => {
    // Row 0 has 1..8 given; the last empty cell (r0c8) can only be 9.
    const canon = parseGrid("123456780" + "0".repeat(72));
    const step = nextHint(1, canon, {});
    expect(step).not.toBeNull();
    expect(step!.technique).toBe("naked-single");
    expect(step!.placement).toEqual({ cell: 8, value: 9 });
    expect(canon.hints[0][8]).toBe(0); // never points at a filled cell
  });
});

describe("nextHint — hidden single (depth 1)", () => {
  it("finds a digit that fits only one cell of a unit (and isn't a naked single)", () => {
    // Force digit 5 out of every cell of box 0 except r0c0, without making r0c0 a
    // naked single: 5 in row 1, row 2, column 1, column 2 (all outside box 0).
    const hints: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    hints[1][3] = 5; // row 1 has a 5
    hints[2][4] = 5; // row 2 has a 5
    hints[3][1] = 5; // column 1 has a 5
    hints[4][2] = 5; // column 2 has a 5
    const canon = { hints };

    const step = nextHint(1, canon, {});
    expect(step).not.toBeNull();
    expect(step!.technique).toBe("hidden-single");
    // Whatever hidden single is found, the placement must be legal on the board.
    const { cell, value } = step!.placement!;
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    expect(canon.hints[r][c]).toBe(0);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(9);
  });
});

describe("nextHint — end-to-end correctness on a singles puzzle", () => {
  it("solves an easy puzzle by hints alone, matching the unique solution", () => {
    const canon = parseGrid(EASY_SINGLES);
    const solution = solve(SudokuModel.fromCanon(canon))!;
    const values: CellValues = {};

    let steps = 0;
    for (; steps < 100; steps++) {
      const step = nextHint(1, canon, values);
      if (!step || !step.placement) break;
      const { cell, value } = step.placement;
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      expect(value).toBe(solution[r][c]); // every hint agrees with the real answer
      values[rc(cell)] = value;
    }

    // Empty cells in the givens = number of hints needed to complete it.
    const emptyCount = canon.hints.flat().filter((v) => v === 0).length;
    expect(Object.keys(values).length).toBe(emptyCount); // fully solved by singles
  });
});

describe("nextHint — give-up case", () => {
  it("returns null on a puzzle with no simple next step (reveal fallback territory)", () => {
    // Inkala's hardest puzzle has no naked/hidden single at the start.
    const step = nextHint(1, parseGrid(INKALA_HARDEST), {});
    expect(step).toBeNull();
  });
});
