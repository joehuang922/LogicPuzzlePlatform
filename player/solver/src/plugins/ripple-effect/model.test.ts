import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { RippleEffectModel, RippleEffectCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: RippleEffectCanon) => RippleEffectModel.fromCanon(c);

/** Rooms as cell-id lists: connected components with the walls as barriers. */
function roomsOf(c: RippleEffectCanon): number[][] {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const seen = new Array(rows * cols).fill(false);
  const rooms: number[][] = [];
  for (let s = 0; s < rows * cols; s++) {
    if (seen[s]) continue;
    const room: number[] = [];
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      const x = stack.pop()!;
      room.push(x);
      const r = Math.floor(x / cols);
      const k = x % cols;
      const links: [boolean, number][] = [
        [k + 1 < cols && !c.edges.v[r][k], x + 1],
        [k > 0 && !c.edges.v[r][k - 1], x - 1],
        [r + 1 < rows && !c.edges.h[r][k], x + cols],
        [r > 0 && !c.edges.h[r - 1][k], x - cols],
      ];
      for (const [open, y] of links) {
        if (open && !seen[y]) {
          seen[y] = true;
          stack.push(y);
        }
      }
    }
    rooms.push(room);
  }
  return rooms;
}

/** Independent rule check: rooms hold 1..N once each, givens kept, ripple spacing held. */
function isValidSolution(c: RippleEffectCanon, numbers: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  for (const room of roomsOf(c)) {
    const values = room.map((x) => numbers[Math.floor(x / cols)][x % cols]).sort((a, b) => a - b);
    if (!values.every((v, i) => v === i + 1)) return false;
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const v = numbers[r][k];
      if (c.cells[r][k] > 0 && c.cells[r][k] !== v) return false;
      for (let d = 1; d <= v; d++) {
        if (k + d < cols && numbers[r][k + d] === v) return false;
        if (r + d < rows && numbers[r + d][k] === v) return false;
      }
    }
  }
  return true;
}

/** Ground truth: plain backtracking over 1..room size per cell, counting up to 2. */
function bruteForce(c: RippleEffectCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const rooms = roomsOf(c);
  const size = new Array(rows * cols);
  for (const room of rooms) for (const x of room) size[x] = room.length;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let found = 0;
  const ok = (x: number) => {
    const r = Math.floor(x / cols);
    const k = x % cols;
    const v = grid[r][k];
    for (let d = 1; d <= v; d++) {
      if (k - d >= 0 && grid[r][k - d] === v) return false;
      if (r - d >= 0 && grid[r - d][k] === v) return false;
    }
    for (const room of rooms) {
      if (!room.includes(x)) continue;
      for (const y of room) if (y < x && grid[Math.floor(y / cols)][y % cols] === v) return false;
    }
    return true;
  };
  const go = (x: number) => {
    if (found >= 2) return;
    if (x === rows * cols) {
      if (isValidSolution(c, grid)) found++;
      return;
    }
    const given = c.cells[Math.floor(x / cols)][x % cols];
    for (let v = 1; v <= size[x]; v++) {
      if (given > 0 && v !== given) continue;
      grid[Math.floor(x / cols)][x % cols] = v;
      if (ok(x)) go(x + 1);
    }
    grid[Math.floor(x / cols)][x % cols] = 0;
  };
  go(0);
  return found;
}

describe("small boards", () => {
  // 1x3 split into rooms {0,1} and {2}: the lone cell is 1, so its neighbour is 2.
  const pair: RippleEffectCanon = { cells: [[0, 0, 0]], edges: { h: [], v: [[0, 1]] } };

  it("a 1x3 of a 2-cell and a 1-cell room has one answer", () => {
    expect(bruteForce(pair)).toBe(1);
    expect(classify(model(pair))).toBe("unique");
    expect(solve(model(pair))).toEqual([[1, 2, 1]]);
  });

  it("two adjacent one-cell rooms clash (both are 1)", () => {
    // Regression: one-cell rooms start settled and must still spread their ripple.
    const c: RippleEffectCanon = { cells: [[0, 0]], edges: { h: [], v: [[1]] } };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });

  it("a given larger than its room has no answer", () => {
    expect(classify(model({ cells: [[3, 0]], edges: { h: [], v: [[0]] } }))).toBe("none");
  });

  it("a 2x2 room alone is ambiguous", () => {
    expect(countSolutions(model({ cells: [[0, 0], [0, 0]], edges: { h: [[0, 0]], v: [[0], [0]] } }), 2)).toBe(2);
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 97;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the backtracking count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      const rows = 2 + Math.floor(rand() * 3); // 2-4
      const cols = 2 + Math.floor(rand() * 3);
      const wall = 0.35 + rand() * 0.4;
      const c: RippleEffectCanon = {
        cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0)),
        edges: {
          h: Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => (rand() < wall ? 1 : 0))),
          v: Array.from({ length: rows }, () => Array.from({ length: cols - 1 }, () => (rand() < wall ? 1 : 0))),
        },
      };
      const size = new Map<number, number>();
      for (const room of roomsOf(c)) for (const x of room) size.set(x, room.length);
      for (let x = 0; x < rows * cols; x++) {
        if (rand() < 0.25) c.cells[Math.floor(x / cols)][x % cols] = 1 + Math.floor(rand() * size.get(x)!);
      }
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

describe("sample boards (docs/ripple-effect)", () => {
  // Settled by propagation and probing: a tiny node budget makes sure of it.
  const budget = { maxNodes: 20 };
  for (const [name, c] of Object.entries(boards as unknown as Record<string, RippleEffectCanon>)) {
    it(`proves the ${c.cells.length}x${c.cells[0].length} '${name}' board unique`, () => {
      expect(classify(model(c), budget)).toBe("unique");
      expect(isValidSolution(c, solve(model(c), budget)!)).toBe(true);
    });
  }
});

describe("gate()", () => {
  it("returns the RippleEffectAnswer shape for a unique puzzle", () => {
    const c: RippleEffectCanon = { cells: [[0, 0, 0]], edges: { h: [], v: [[0, 1]] } };
    expect(gate(25, c)).toEqual({ verdict: "unique", solution: { numbers: [[1, 2, 1]] } });
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(25, { cells: [[0, 0], [0, 0]], edges: { h: [[0, 0]], v: [[0], [0]] } })).toEqual({
      verdict: "multiple",
      solution: null,
    });
    expect(gate(25, { cells: [[3, 0]], edges: { h: [], v: [[0]] } })).toEqual({ verdict: "none", solution: null });
  });
});
