import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { NuritwinModel, NuritwinCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: NuritwinCanon) => NuritwinModel.fromCanon(c);

/** Connected components of the cells passing `keep`, using `linked` for adjacency. */
function components(rows: number, cols: number, keep: (r: number, c: number) => boolean, linked: (a: number, b: number) => boolean): number[][] {
  const seen = new Array(rows * cols).fill(false);
  const out: number[][] = [];
  for (let s = 0; s < rows * cols; s++) {
    if (seen[s] || !keep(Math.floor(s / cols), s % cols)) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      const r = Math.floor(x / cols);
      const c = x % cols;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const y = rr * cols + cc;
        if (!seen[y] && keep(rr, cc) && linked(x, y)) {
          seen[y] = true;
          stack.push(y);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

/** Independent rule check, written from the rules rather than the model. */
function isValidSolution(c: NuritwinCanon, states: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const sameRoom = (a: number, b: number) => {
    const [ra, ca, rb, cb] = [Math.floor(a / cols), a % cols, Math.floor(b / cols), b % cols];
    if (ra === rb) return !c.grids.v[ra][Math.min(ca, cb)];
    return !c.grids.h[Math.min(ra, rb)][ca];
  };
  const rooms = components(rows, cols, () => true, sameRoom);
  for (const room of rooms) {
    const inRoom = new Set(room);
    const groups = components(rows, cols, (r, k) => inRoom.has(r * cols + k) && states[r][k] === 1, sameRoom);
    if (groups.length !== 2 || groups[0].length !== groups[1].length) return false;
    // Two different numbers in one room is a format error (the API refuses it): no answer.
    const clues = new Set(room.map((x) => c.cells[Math.floor(x / cols)][x % cols]).filter((n) => n > 0));
    if (clues.size > 1) return false;
    const [clue] = clues;
    if (clue && groups[0].length !== clue) return false;
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let k = 0; k + 1 < cols; k++) {
      if (states[r][k] && states[r][k + 1] && states[r + 1][k] && states[r + 1][k + 1]) return false;
    }
  }
  return components(rows, cols, (r, k) => states[r][k] === 1, () => true).length === 1;
}

/** Ground truth: every shading of the board, counted up to 2. */
function bruteForce(c: NuritwinCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  let found = 0;
  for (let mask = 0; mask < 1 << (rows * cols) && found < 2; mask++) {
    const states = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, k) => (mask >> (r * cols + k)) & 1));
    if (isValidSolution(c, states)) found++;
  }
  return found;
}

const noWalls = (rows: number, cols: number) => ({
  h: Array.from({ length: rows - 1 }, () => new Array(cols).fill(0)),
  v: Array.from({ length: rows }, () => new Array(cols - 1).fill(0)),
});

describe("small boards", () => {
  it("a lone 1x3 room has no answer: its twins can only be the two ends, which never connect", () => {
    const c: NuritwinCanon = { cells: [[0, 0, 0]], grids: noWalls(1, 3) };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });

  it("a room too small for its twins has no answer", () => {
    expect(classify(model({ cells: [[2, 0, 0, 0]], grids: noWalls(1, 4) }))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 2024;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings each), so the exhaustive count stays quick.
      const rows = 2 + Math.floor(rand() * 3); // 2-4
      const cols = rows === 2 ? 3 + Math.floor(rand() * 4) : 3 + Math.floor(rand() * (rows === 3 ? 2 : 1));
      const wall = rand() * 0.5;
      const c: NuritwinCanon = {
        cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.1 ? 1 + Math.floor(rand() * 2) : 0))),
        grids: {
          h: Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => (rand() < wall ? 1 : 0))),
          v: Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => (rand() < wall ? 1 : 0))),
        },
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

describe("sample board (docs/nuritwin)", () => {
  it("proves the 10x10 sample unique by deduction alone", () => {
    const c = (boards as unknown as Record<string, NuritwinCanon>).sample;
    const budget = { maxNodes: 1 };
    expect(classify(model(c), budget)).toBe("unique");
    expect(isValidSolution(c, solve(model(c), budget)!)).toBe(true);
  });
});

describe("gate()", () => {
  it("returns the NuritwinAnswer shape for a unique puzzle", () => {
    const c = (boards as unknown as Record<string, NuritwinCanon>).sample;
    const result = gate(9, c)!;
    expect(result.verdict).toBe("unique");
    expect(Object.keys(result.solution as object)).toEqual(["states"]);
    expect(isValidSolution(c, (result.solution as { states: number[][] }).states)).toBe(true);
  });

  it("reports 'none' with no solution", () => {
    expect(gate(9, { cells: [[0, 0, 0]], grids: noWalls(1, 3) })).toEqual({ verdict: "none", solution: null });
  });
});
