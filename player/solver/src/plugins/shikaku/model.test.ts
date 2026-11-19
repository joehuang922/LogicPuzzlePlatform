import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { ShikakuModel, ShikakuCanon, ShikakuSolution } from "./model";
import boards from "./fixtures.json";

const model = (c: ShikakuCanon) => ShikakuModel.fromCanon(c);

/** Independent rule check: the rectangles tile the board, each holds one clue of its area. */
function isValidSolution(c: ShikakuCanon, { rects }: ShikakuSolution): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const cover = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const q of rects) {
    if (q.r < 0 || q.c < 0 || q.r + q.h > rows || q.c + q.w > cols) return false;
    const clues: number[] = [];
    for (let r = q.r; r < q.r + q.h; r++) {
      for (let k = q.c; k < q.c + q.w; k++) {
        cover[r][k]++;
        if (c.cells[r][k] > 0) clues.push(c.cells[r][k]);
      }
    }
    if (clues.length !== 1 || clues[0] !== q.w * q.h) return false;
  }
  return cover.every((row) => row.every((v) => v === 1));
}

/**
 * Ground truth: tile the board from its first uncovered cell (row-major), trying every
 * rectangle with that cell as its top-left corner that fits on uncovered cells and holds
 * exactly one clue of its area, and count the tilings the rules accept, up to 2.
 */
function bruteForce(c: ShikakuCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const cover = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const rects: ShikakuSolution["rects"] = [];
  let found = 0;
  const go = () => {
    if (found >= 2) return;
    let x = -1;
    for (let i = 0; i < rows * cols && x < 0; i++) if (!cover[Math.floor(i / cols)][i % cols]) x = i;
    if (x < 0) {
      if (isValidSolution(c, { rects })) found++;
      return;
    }
    const r = Math.floor(x / cols);
    const k = x % cols;
    for (let h = 1; r + h <= rows; h++) {
      for (let w = 1; k + w <= cols; w++) {
        let free = true;
        for (let a = r; a < r + h && free; a++) for (let b = k; b < k + w && free; b++) if (cover[a][b]) free = false;
        if (!free) break;
        // Only rectangles holding exactly one clue of their area can be in a tiling.
        const clues: number[] = [];
        for (let a = r; a < r + h; a++) for (let b = k; b < k + w; b++) if (c.cells[a][b] > 0) clues.push(c.cells[a][b]);
        if (clues.length !== 1 || clues[0] !== w * h) continue;
        for (let a = r; a < r + h; a++) for (let b = k; b < k + w; b++) cover[a][b] = true;
        rects.push({ r, c: k, w, h });
        go();
        rects.pop();
        for (let a = r; a < r + h; a++) for (let b = k; b < k + w; b++) cover[a][b] = false;
      }
    }
  };
  go();
  return found;
}

describe("small boards", () => {
  it("a 2x2 with a 4 is one square", () => {
    const c: ShikakuCanon = { cells: [[4, 0], [0, 0]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual({ rects: [{ r: 0, c: 0, w: 2, h: 2 }] });
  });

  it("two 2s on a 2x2 diagonal are ambiguous", () => {
    const c: ShikakuCanon = { cells: [[2, 0], [0, 2]] };
    expect(bruteForce(c)).toBe(2);
    expect(countSolutions(model(c), 2)).toBe(2);
  });

  it("clues that don't add up to the board have no answer", () => {
    expect(classify(model({ cells: [[2, 0, 0]] }))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 2222;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  /** A random tiling into rectangles, one clue (its area) dropped in each. */
  function randomBoard(): ShikakuCanon {
    const rows = 2 + Math.floor(rand() * 4);
    const cols = 2 + Math.floor(rand() * 4);
    const cells = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const used = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (let x = 0; x < rows * cols; x++) {
      const r = Math.floor(x / cols);
      const k = x % cols;
      if (used[r][k]) continue;
      let h = 1 + Math.floor(rand() * 3);
      let w = 1 + Math.floor(rand() * 3);
      h = Math.min(h, rows - r);
      let maxW = 0;
      while (k + maxW < cols && !used[r][k + maxW]) maxW++;
      w = Math.min(w, maxW);
      for (let a = r; a < r + h; a++) for (let b = k; b < k + w; b++) used[a][b] = true;
      cells[r + Math.floor(rand() * h)][k + Math.floor(rand() * w)] = w * h;
    }
    // Sometimes nudge a clue to make boards with no answer.
    if (rand() < 0.15) {
      const r = Math.floor(rand() * rows);
      const k = Math.floor(rand() * cols);
      if (cells[r][k] > 1) cells[r][k]--;
    }
    return { cells };
  }

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      const c = randomBoard();
      const expected = bruteForce(c);
      const got = countSolutions(model(c), 2);
      expect({ c, got }).toEqual({ c, got: expected });
      verdicts[expected as 0 | 1 | 2]++;
      if (expected === 1) expect(isValidSolution(c, solve(model(c))!)).toBe(true);
    }
    expect(verdicts[0]).toBeGreaterThan(0);
    expect(verdicts[1]).toBeGreaterThan(0);
    expect(verdicts[2]).toBeGreaterThan(0);
  }, 60_000);
});

describe("sample boards (docs/shikaku)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, ShikakuCanon>)) {
    it(`proves the ${name} board unique by deduction alone`, () => {
      expect(classify(model(b), { maxNodes: 1 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    });
  }
});

describe("gate()", () => {
  it("returns the ShikakuAnswer shape for a unique puzzle", () => {
    expect(gate(22, { cells: [[1, 2, 0]] })).toEqual({
      verdict: "unique",
      solution: { rects: [{ r: 0, c: 0, w: 1, h: 1 }, { r: 0, c: 1, w: 2, h: 1 }] },
    });
  });

  it("reports 'none' with no solution", () => {
    expect(gate(22, { cells: [[2, 0, 0]] })).toEqual({ verdict: "none", solution: null });
  });
});
