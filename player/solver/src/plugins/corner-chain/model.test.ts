import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { CornerChainModel, CornerChainCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: CornerChainCanon) => CornerChainModel.fromCanon(c);

/**
 * Independent rule check, written from the rules (as the player's completion check): no
 * shaded clue; every island's clues equal its size; even islands fill their bounding box,
 * odd ones don't; at least one island, and all islands linked through diagonal corners.
 */
function isValidSolution(c: CornerChainCanon, states: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const island = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (c.cells[r][k] > 0 && states[r][k]) return false;
      if (states[r][k] || island[r][k] >= 0) continue;
      const id = count++;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[r, k]];
      island[r][k] = id;
      while (stack.length) {
        const [a, b] = stack.pop()!;
        cells.push([a, b]);
        for (const [p, q] of [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]]) {
          if (p < 0 || q < 0 || p >= rows || q >= cols || states[p][q] || island[p][q] >= 0) continue;
          island[p][q] = id;
          stack.push([p, q]);
        }
      }
      if (cells.some(([a, b]) => c.cells[a][b] > 0 && c.cells[a][b] !== cells.length)) return false;
      const h = Math.max(...cells.map(([a]) => a)) - Math.min(...cells.map(([a]) => a)) + 1;
      const w = Math.max(...cells.map(([, b]) => b)) - Math.min(...cells.map(([, b]) => b)) + 1;
      if ((cells.length % 2 === 0) !== (h * w === cells.length)) return false;
    }
  }
  if (count === 0) return false;
  // Islands joined through diagonal corners.
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let r = 0; r + 1 < rows; r++) {
    for (let k = 0; k < cols; k++) {
      for (const q of [k - 1, k + 1]) {
        if (q < 0 || q >= cols || island[r][k] < 0 || island[r + 1][q] < 0) continue;
        parent[find(island[r][k])] = find(island[r + 1][q]);
      }
    }
  }
  return new Set(Array.from({ length: count }, (_, i) => find(i))).size === 1;
}

/** Ground truth: every shading of the board, counted up to 2. */
function bruteForce(c: CornerChainCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  let found = 0;
  for (let mask = 0; mask < 1 << (rows * cols) && found < 2; mask++) {
    const states = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, k) => (mask >> (r * cols + k)) & 1));
    if (isValidSolution(c, states)) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 2 on a 1x3 strip makes a domino and shades the far end", () => {
    // [2 . .]: the 2's island is a 1x2 rectangle (cells 0-1); cell 2 alone would be a
    // single-cell island, so it is shaded.
    const c: CornerChainCanon = { cells: [[2, 0, 0]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[0, 0, 1]]);
  });

  it("a 1 has no answer (an island of one cell is a square, and 1 is odd)", () => {
    expect(bruteForce({ cells: [[1, 0]] })).toBe(0);
    expect(classify(model({ cells: [[1, 0]] }))).toBe("none");
  });

  it("a 3 in a 2x2 makes an L (an odd island must not be a rectangle)", () => {
    // Every answer is an L of three cells holding the clue; the counts must agree.
    const c: CornerChainCanon = { cells: [[3, 0], [0, 0]] };
    expect(bruteForce(c)).toBe(countSolutions(model(c), 2));
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 3030;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings).
      const rows = 1 + Math.floor(rand() * 4);
      const cols = 2 + Math.floor(rand() * (rows <= 2 ? 5 : rows === 3 ? 3 : 2));
      const c: CornerChainCanon = {
        cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.25 ? 2 + Math.floor(rand() * 4) : 0))),
      };
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

describe("sample boards (docs/corner-chain)", () => {
  type Board = CornerChainCanon & { answer?: number[][] };
  for (const [name, b] of Object.entries(boards as unknown as Record<string, Board>)) {
    it(`proves the ${name} board unique by deduction alone`, () => {
      expect(classify(model(b), { maxNodes: 1 })).toBe("unique");
      const s = solve(model(b))!;
      expect(isValidSolution(b, s)).toBe(true);
      if (b.answer) expect(s).toEqual(b.answer); // the rule sheet's published answer
    });
  }
});

describe("gate()", () => {
  it("returns the CornerChainAnswer shape for a unique puzzle", () => {
    expect(gate(30, { cells: [[2, 0, 0]] })).toEqual({ verdict: "unique", solution: { states: [[0, 0, 1]] } });
  });

  it("reports 'none' with no solution", () => {
    expect(gate(30, { cells: [[1, 0]] })).toEqual({ verdict: "none", solution: null });
  });
});
