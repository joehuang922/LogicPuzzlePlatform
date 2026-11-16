import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { NorinoriModel, NorinoriCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: NorinoriCanon) => NorinoriModel.fromCanon(c);
const dims = (c: NorinoriCanon) => [c.grids.v.length, c.grids.v[0].length + 1];

/** Room id per cell: connected components with the walls as barriers. */
function roomIds(c: NorinoriCanon): number[] {
  const [rows, cols] = dims(c);
  const id = new Array(rows * cols).fill(-1);
  let next = 0;
  for (let s = 0; s < rows * cols; s++) {
    if (id[s] >= 0) continue;
    const stack = [s];
    id[s] = next;
    while (stack.length) {
      const x = stack.pop()!;
      const r = Math.floor(x / cols);
      const k = x % cols;
      const links: [boolean, number][] = [
        [k + 1 < cols && !c.grids.v[r][k], x + 1],
        [k > 0 && !c.grids.v[r][k - 1], x - 1],
        [r + 1 < rows && !c.grids.h[r][k], x + cols],
        [r > 0 && !c.grids.h[r - 1][k], x - cols],
      ];
      for (const [open, y] of links) {
        if (open && id[y] < 0) {
          id[y] = next;
          stack.push(y);
        }
      }
    }
    next++;
  }
  return id;
}

/** Independent rule check: two shaded cells per room, each with exactly one shaded neighbour. */
function isValidSolution(c: NorinoriCanon, states: number[][]): boolean {
  const [rows, cols] = dims(c);
  const room = roomIds(c);
  const count = new Map<number, number>();
  for (let x = 0; x < rows * cols; x++) count.set(room[x], (count.get(room[x]) ?? 0) + states[Math.floor(x / cols)][x % cols]);
  if ([...count.values()].some((n) => n !== 2)) return false;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (!states[r][k]) continue;
      const n = (states[r - 1]?.[k] ?? 0) + (states[r + 1]?.[k] ?? 0) + (states[r][k - 1] ?? 0) + (states[r][k + 1] ?? 0);
      if (n !== 1) return false;
    }
  }
  return true;
}

/** Ground truth: every shading of the board, counted up to 2. */
function bruteForce(c: NorinoriCanon): number {
  const [rows, cols] = dims(c);
  let found = 0;
  for (let mask = 0; mask < 1 << (rows * cols) && found < 2; mask++) {
    const states = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, k) => (mask >> (r * cols + k)) & 1));
    if (isValidSolution(c, states)) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 1x5 split into rooms of 2 and 3 cells has one answer", () => {
    // The 2-cell room is a domino, so its neighbour stays white and the 3-cell room's
    // domino takes its far end.
    const c: NorinoriCanon = { grids: { h: [], v: [[0, 1, 0, 0]] } };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[1, 1, 0, 1, 1]]);
  });

  it("a 1x4 of two 2-cell rooms has no answer (four in a row)", () => {
    const c: NorinoriCanon = { grids: { h: [], v: [[0, 1, 0]] } };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });

  it("a lone 1x3 room is ambiguous (the domino sits left or right)", () => {
    expect(bruteForce({ grids: { h: [], v: [[0, 0]] } })).toBe(2);
    expect(countSolutions(model({ grids: { h: [], v: [[0, 0]] } }), 2)).toBe(2);
  });

  it("a one-cell room has no answer", () => {
    expect(classify(model({ grids: { h: [], v: [[1, 0]] } }))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 31337;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings each), so the exhaustive count stays quick.
      const rows = 2 + Math.floor(rand() * 3);
      const cols = 2 + Math.floor(rand() * (rows === 2 ? 5 : rows === 3 ? 3 : 2));
      const wall = 0.2 + rand() * 0.5;
      const c: NorinoriCanon = {
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

describe("sample boards (docs/norinori)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, NorinoriCanon>)) {
    const [rows, cols] = dims(b);
    it(`proves the ${rows}x${cols} '${name}' board unique by deduction alone`, () => {
      const budget = { maxNodes: 1 };
      expect(classify(model(b), budget)).toBe("unique");
      expect(isValidSolution(b, solve(model(b), budget)!)).toBe(true);
    });
  }
});

describe("gate()", () => {
  it("returns the NorinoriAnswer shape for a unique puzzle", () => {
    expect(gate(23, { grids: { h: [], v: [[0, 1, 0, 0]] } })).toEqual({ verdict: "unique", solution: { states: [[1, 1, 0, 1, 1]] } });
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(23, { grids: { h: [], v: [[0, 0]] } })).toEqual({ verdict: "multiple", solution: null });
    expect(gate(23, { grids: { h: [], v: [[1, 0]] } })).toEqual({ verdict: "none", solution: null });
  });
});
