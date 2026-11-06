import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { ComboSudokuModel, ComboSudokuCanon, ComboSudokuSolution } from "./model";
// The parser's sample keys (docs/combo-sudoku): 4 to 14 boards in stacked, cross, X,
// staircase and spread layouts, each a published puzzle with one solution.
import board2 from "../../../../../docs/combo-sudoku/board_2_ans.json";
import board3 from "../../../../../docs/combo-sudoku/board_3_ans.json";
import board4 from "../../../../../docs/combo-sudoku/board_4_ans.json";
import board5 from "../../../../../docs/combo-sudoku/board_5_ans.json";
import board6 from "../../../../../docs/combo-sudoku/board_6_ans.json";
import board7 from "../../../../../docs/combo-sudoku/board_7_ans.json";
import board8 from "../../../../../docs/combo-sudoku/board_8_ans.json";

const SAMPLES: [string, ComboSudokuCanon][] = [
  ["board_2", board2],
  ["board_3", board3],
  ["board_4", board4],
  ["board_5", board5],
  ["board_6", board6],
  ["board_7", board7],
  ["board_8", board8],
];

const empty = () => Array.from({ length: 9 }, () => new Array<number>(9).fill(0));

/** True iff every board is a legal filled sudoku, keeps its givens, and shared cells agree. */
function isValidSolution(canon: ComboSudokuCanon, sol: ComboSudokuSolution): boolean {
  const ok = (nums: number[]) => new Set(nums).size === 9 && nums.every((n) => n >= 1 && n <= 9);
  const global = new Map<string, number>();
  for (const [i, sb] of canon.subboards.entries()) {
    const out = sol.subboards[i];
    if (out.x !== sb.x || out.y !== sb.y) return false;
    const g = out.answers;
    for (let k = 0; k < 9; k++) {
      if (!ok(g[k]) || !ok(g.map((row) => row[k]))) return false;
      const box: number[] = [];
      for (let d = 0; d < 9; d++) box.push(g[3 * Math.floor(k / 3) + Math.floor(d / 3)][3 * (k % 3) + (d % 3)]);
      if (!ok(box)) return false;
    }
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (sb.hints[r][c] !== 0 && sb.hints[r][c] !== g[r][c]) return false;
        const key = `${3 * sb.x + c},${3 * sb.y + r}`;
        if (global.has(key) && global.get(key) !== g[r][c]) return false;
        global.set(key, g[r][c]);
      }
    }
  }
  return true;
}

describe("published samples", () => {
  for (const [name, canon] of SAMPLES) {
    it(`${name} (${canon.subboards.length} boards) is unique within a small node budget`, () => {
      // Hidden singles keep every sample under ~40 nodes; naked singles alone took up
      // to ~477k (board_6). The budget pins that, deterministically.
      expect(classify(ComboSudokuModel.fromCanon(canon), { maxNodes: 500 })).toBe("unique");
      const sol = solve(ComboSudokuModel.fromCanon(canon));
      expect(sol).not.toBeNull();
      expect(isValidSolution(canon, sol!)).toBe(true);
    });
  }
});

describe("verdicts", () => {
  it("an empty board has many solutions", () => {
    expect(countSolutions(ComboSudokuModel.fromCanon({ subboards: [{ x: 0, y: 0, hints: empty() }] }), 2)).toBe(2);
  });

  it("a board with a sample's givens removed has many solutions", () => {
    const canon = { subboards: board4.subboards.map((sb, i) => (i === 0 ? { ...sb, hints: empty() } : sb)) };
    // Board 0's own (unshared) cells keep their constraint only through its givens.
    expect(classify(ComboSudokuModel.fromCanon(canon), { maxNodes: 100_000 })).toBe("multiple");
  });

  it("overlapping boards that give a shared cell different digits have no solution", () => {
    const a = empty();
    const b = empty();
    a[8][8] = 4; // A's bottom-right cell is B's (2, 2)
    b[2][2] = 5;
    const canon = { subboards: [{ x: 0, y: 0, hints: a }, { x: 2, y: 2, hints: b }] };
    expect(ComboSudokuModel.fromCanon(canon).isDead()).toBe(true);
    expect(classify(ComboSudokuModel.fromCanon(canon))).toBe("none");
  });

  // A at (0,0) and B at (2,0) share the rooms in global columns 6-8 of rows 0-8.
  const sideBySide = (bCol: number) => {
    const a = empty();
    const b = empty();
    a[0][0] = 7; // global (0, 0): A only
    b[0][bCol] = 7; // global (6 + bCol, 0)
    return { subboards: [{ x: 0, y: 0, hints: a }, { x: 2, y: 0, hints: b }] };
  };

  it("a row is a board's, not the page's: one digit at both ends of a global row is fine", () => {
    // Global (0,0) and (14,0) share no board, so the two 7s never meet.
    expect(classify(ComboSudokuModel.fromCanon(sideBySide(8)))).toBe("multiple");
  });

  it("a digit B gives in a shared cell repeats in A's row: no solution", () => {
    // B's (1, 0) is global (7, 0), in A's row 0 next to A's 7.
    expect(classify(ComboSudokuModel.fromCanon(sideBySide(1)))).toBe("none");
  });
});

describe("gate() end-to-end", () => {
  it("registers type 2 and stores every board's filled grid", () => {
    const result = gate(2, board7);
    expect(result?.verdict).toBe("unique");
    const sol = result!.solution as ComboSudokuSolution;
    expect(sol.subboards.map(({ x, y }) => [x, y])).toEqual(board7.subboards.map(({ x, y }) => [x, y]));
    expect(isValidSolution(board7, sol)).toBe(true);
  });
});
