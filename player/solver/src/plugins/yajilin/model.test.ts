import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { YajilinModel, YajilinCanon, YajilinSolution } from "./model";
import boards from "./fixtures.json";

type Dir = "up" | "down" | "left" | "right";
const STEP: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** rows x cols canon with `[row, col, dir, num]` clues. */
function canon(rows: number, cols: number, clues: [number, number, string, number][]): YajilinCanon {
  const cells: YajilinCanon["cells"] = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const [r, c, dir, num] of clues) cells[r][c] = { dir: dir as Dir, num };
  return { cells };
}

const model = (c: YajilinCanon) => YajilinModel.fromCanon(c);

/**
 * Independent rule check, written from the rules rather than the model: every empty cell
 * is shaded (no lines) or on the loop (two lines), clue cells have neither, shaded cells
 * never touch, every clue counts its shaded cells, and the lines form one loop.
 */
function isValidSolution(c: YajilinCanon, { blacks, edges: { h, v } }: YajilinSolution): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const degree = (r: number, k: number) =>
    (k > 0 ? h[r][k - 1] : 0) + (k < cols - 1 ? h[r][k] : 0) + (r > 0 ? v[r - 1][k] : 0) + (r < rows - 1 ? v[r][k] : 0);
  let onCells = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const d = degree(r, k);
      const clue = c.cells[r][k];
      if (clue) {
        if (d !== 0 || blacks[r][k]) return false;
        let n = 0;
        const [dr, dc] = STEP[clue.dir];
        for (let rr = r + dr, cc = k + dc; rr >= 0 && cc >= 0 && rr < rows && cc < cols; rr += dr, cc += dc) n += blacks[rr][cc];
        if (n !== clue.num) return false;
      } else if (blacks[r][k]) {
        if (d !== 0) return false;
        if ((r > 0 && blacks[r - 1][k]) || (k > 0 && blacks[r][k - 1])) return false;
      } else {
        if (d !== 2) return false;
        onCells++;
        start ??= [r, k];
      }
    }
  }
  if (!start) return false;
  // Walk the loop; one loop iff it visits every cell with lines.
  const next = (r: number, k: number): [number, number][] => {
    const out: [number, number][] = [];
    if (k > 0 && h[r][k - 1]) out.push([r, k - 1]);
    if (k < cols - 1 && h[r][k]) out.push([r, k + 1]);
    if (r > 0 && v[r - 1][k]) out.push([r - 1, k]);
    if (r < rows - 1 && v[r][k]) out.push([r + 1, k]);
    return out;
  };
  let prev: [number, number] = [-1, -1];
  let cur = start;
  let visited = 0;
  do {
    visited++;
    const step = next(cur[0], cur[1]).find(([a, b]) => a !== prev[0] || b !== prev[1])!;
    prev = cur;
    cur = step;
  } while (cur[0] !== start[0] || cur[1] !== start[1]);
  return visited === onCells;
}

/**
 * Ground truth: try every edge subset (shading follows from it: an empty cell without
 * lines is shaded) and count valid ones, capped at 2.
 */
function bruteForce(c: YajilinCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const hn = rows * (cols - 1);
  const total = hn + (rows - 1) * cols;
  // Incident edge bits per cell, for a cheap degree filter before the full check.
  const incident: number[] = new Array(rows * cols).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols - 1; k++) {
      incident[r * cols + k] |= 1 << (r * (cols - 1) + k);
      incident[r * cols + k + 1] |= 1 << (r * (cols - 1) + k);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols; k++) {
      incident[r * cols + k] |= 1 << (hn + r * cols + k);
      incident[(r + 1) * cols + k] |= 1 << (hn + r * cols + k);
    }
  }
  const clue = c.cells.flat().map((x) => x !== null);
  const popcount = (x: number) => {
    let n = 0;
    for (; x; x &= x - 1) n++;
    return n;
  };
  let found = 0;
  for (let mask = 1; mask < 1 << total && found < 2; mask++) {
    if (!incident.every((bits, i) => {
      const d = popcount(mask & bits);
      return clue[i] ? d === 0 : d === 0 || d === 2;
    })) continue;
    const bit = (i: number) => (mask >> i) & 1;
    const h = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, k) => bit(r * (cols - 1) + k)));
    const v = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, k) => bit(hn + r * cols + k)));
    const blacks = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, k) => {
        if (c.cells[r][k]) return 0;
        const d = (k > 0 ? h[r][k - 1] : 0) + (k < cols - 1 ? h[r][k] : 0) + (r > 0 ? v[r - 1][k] : 0) + (r < rows - 1 ? v[r][k] : 0);
        return d === 0 ? 1 : 0;
      }),
    );
    if (isValidSolution(c, { blacks, edges: { h, v } })) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 3x4 with a 'left 1' clue next to the corner has one answer", () => {
    // The corner cell beside the clue has one free neighbour, so it can't be on the loop
    // and is shaded, as the clue says; the loop fills the remaining ten cells.
    const c = canon(3, 4, [[0, 1, "left", 1]]);
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    const s = solve(model(c))!;
    expect(isValidSolution(c, s)).toBe(true);
    expect(s.blacks).toEqual([[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  });

  it("a 3x3 whose 'down 1' clue strands both top corners has no answer", () => {
    const c = canon(3, 3, [[0, 1, "down", 1]]);
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });

  it("a clue asking for more shaded cells than fit has no answer", () => {
    expect(classify(model(canon(3, 3, [[0, 0, "right", 2]])))).toBe("none");
  });

  it("a board with no clues is ambiguous", () => {
    expect(countSolutions(model(canon(3, 4, [])), 2)).toBe(2);
  });

  it("a one-row board has no loop", () => {
    expect(classify(model(canon(1, 4, [[0, 0, "right", 0]])))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 4242;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  const dirs = ["up", "down", "left", "right"];

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // 3x3, 3x4 or 4x3: at most 17 edges.
      const rows = 3 + Math.floor(rand() * 2);
      const cols = rows === 4 ? 3 : 3 + Math.floor(rand() * 2);
      const clues: [number, number, string, number][] = [];
      const n = 1 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        clues.push([Math.floor(rand() * rows), Math.floor(rand() * cols), dirs[Math.floor(rand() * 4)], Math.floor(rand() * 3)]);
      }
      const c = canon(rows, cols, clues);
      const expected = bruteForce(c);
      const got = countSolutions(model(c), 2);
      expect({ clues, rows, cols, got }).toEqual({ clues, rows, cols, got: expected });
      verdicts[expected as 0 | 1 | 2]++;
      if (expected === 1) expect(isValidSolution(c, solve(model(c))!)).toBe(true);
    }
    expect(verdicts[0]).toBeGreaterThan(0);
    expect(verdicts[1]).toBeGreaterThan(0);
    expect(verdicts[2]).toBeGreaterThan(0);
  }, 60_000);
});

describe("sample boards (docs/yajilin)", () => {
  // Settled by propagation and probing at construction: a tiny node budget makes sure the
  // verdict comes from deduction, not a lucky search.
  const budget = { maxNodes: 50 };
  type Board = { rows: number; cols: number; clues: [number, number, string, number][] };

  for (const [name, b] of Object.entries(boards as unknown as Record<string, Board>)) {
    it(`proves the ${b.rows}x${b.cols} '${name}' board unique`, () => {
      const c = canon(b.rows, b.cols, b.clues);
      expect(classify(model(c), budget)).toBe("unique");
      expect(isValidSolution(c, solve(model(c), budget)!)).toBe(true);
    }, 30_000);
  }
});

describe("gate()", () => {
  it("returns the YajilinAnswer shape for a unique puzzle", () => {
    const result = gate(13, canon(3, 4, [[0, 1, "left", 1]]));
    expect(result).toEqual({
      verdict: "unique",
      solution: {
        blacks: [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
        edges: { h: [[0, 0, 1], [1, 1, 0], [1, 1, 1]], v: [[0, 0, 1, 1], [1, 0, 0, 1]] },
      },
    });
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(13, canon(3, 4, []))).toEqual({ verdict: "multiple", solution: null });
    expect(gate(13, canon(3, 3, [[0, 0, "right", 2]]))).toEqual({ verdict: "none", solution: null });
  });
});
