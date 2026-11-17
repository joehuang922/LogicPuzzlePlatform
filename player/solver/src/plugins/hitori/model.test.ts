import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { HitoriModel, HitoriCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: HitoriCanon) => HitoriModel.fromCanon(c);

/** Independent rule check, written from the rules (as the player's completion check). */
function isValidSolution(c: HitoriCanon, states: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  for (let r = 0; r < rows; r++) {
    const seen = new Set<number>();
    for (let k = 0; k < cols; k++) {
      if (states[r][k]) continue;
      if (seen.has(c.cells[r][k])) return false;
      seen.add(c.cells[r][k]);
    }
  }
  for (let k = 0; k < cols; k++) {
    const seen = new Set<number>();
    for (let r = 0; r < rows; r++) {
      if (states[r][k]) continue;
      if (seen.has(c.cells[r][k])) return false;
      seen.add(c.cells[r][k]);
    }
  }
  let whites = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (states[r][k]) {
        if ((k + 1 < cols && states[r][k + 1]) || (r + 1 < rows && states[r + 1][k])) return false;
      } else {
        whites++;
        start ??= [r, k];
      }
    }
  }
  if (!start) return false;
  const seen = new Set([start[0] * cols + start[1]]);
  const stack = [start];
  while (stack.length) {
    const [r, k] = stack.pop()!;
    for (const [a, b] of [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]]) {
      if (a < 0 || b < 0 || a >= rows || b >= cols || states[a][b] || seen.has(a * cols + b)) continue;
      seen.add(a * cols + b);
      stack.push([a, b]);
    }
  }
  return seen.size === whites;
}

/** Ground truth: every shading of the board, counted up to 2. */
function bruteForce(c: HitoriCanon): number {
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
  it("a 2x2 with a repeated pair shades one of them", () => {
    // 1 1 / 2 3: shade the left 1 or the right 1 — both keep the whites connected.
    const c: HitoriCanon = { cells: [[1, 1], [2, 3]] };
    expect(bruteForce(c)).toBe(2);
    expect(countSolutions(model(c), 2)).toBe(2);
  });

  it("a 1x3 of 1 2 1 is ambiguous: either end may be shaded", () => {
    const c: HitoriCanon = { cells: [[1, 2, 1]] };
    expect(bruteForce(c)).toBe(2);
    expect(countSolutions(model(c), 2)).toBe(2);
  });

  it("three equal cells in a row shade both ends", () => {
    // 1 1 1: two must go, and they can't touch, so the ends; the lone middle is connected.
    const c: HitoriCanon = { cells: [[1, 1, 1]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[1, 0, 1]]);
  });

  it("a 2x2 of one number has no answer", () => {
    // Each row and column keeps one 1, so the two whites sit diagonally: disconnected.
    const c: HitoriCanon = { cells: [[1, 1], [1, 1]] };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 777;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings); numbers from a small range so repeats are common.
      const rows = 2 + Math.floor(rand() * 3);
      const cols = 2 + Math.floor(rand() * (rows === 2 ? 5 : rows === 3 ? 3 : 2));
      const range = Math.max(rows, cols) + Math.floor(rand() * 2);
      const c: HitoriCanon = { cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1 + Math.floor(rand() * range))) };
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

describe("sample boards (docs/hitori)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, HitoriCanon>)) {
    it(`proves the ${name} board unique`, () => {
      expect(classify(model(b), { maxNodes: 2_000 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    }, 30_000);
  }
});

describe("gate()", () => {
  it("returns the HitoriAnswer shape for a unique puzzle", () => {
    const c = (boards as unknown as Record<string, HitoriCanon>)["8x8"];
    const result = gate(26, c)!;
    expect(result.verdict).toBe("unique");
    expect(Object.keys(result.solution as object)).toEqual(["states"]);
    expect(isValidSolution(c, (result.solution as { states: number[][] }).states)).toBe(true);
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(26, { cells: [[1, 1], [2, 3]] })).toEqual({ verdict: "multiple", solution: null });
    expect(gate(26, { cells: [[1, 1], [1, 1]] })).toEqual({ verdict: "none", solution: null });
  });
});
