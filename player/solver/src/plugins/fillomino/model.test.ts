import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { FillominoModel, FillominoCanon, FillominoSolution } from "./model";
import boards from "./fixtures.json";

const model = (c: FillominoCanon) => FillominoModel.fromCanon(c);

/**
 * Independent rule check, written from the rules: the walls split the board into rooms
 * (more than one), every cell of a room holds the room's size, rooms that share an edge
 * hold different numbers, clues are kept, and the walls are exactly where numbers change
 * (as the answer stores them).
 */
function isValidSolution(c: FillominoCanon, { numbers, edges }: FillominoSolution): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (c.cells[r][k] > 0 && numbers[r][k] !== c.cells[r][k]) return false;
      if (r + 1 < rows && edges.h[r][k] !== (numbers[r][k] !== numbers[r + 1][k] ? 1 : 0)) return false;
      if (k + 1 < cols && edges.v[r][k] !== (numbers[r][k] !== numbers[r][k + 1] ? 1 : 0)) return false;
    }
  }
  // Rooms: components with walls as barriers.
  const room = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  let rooms = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (room[r][k] >= 0) continue;
      const id = rooms++;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[r, k]];
      room[r][k] = id;
      while (stack.length) {
        const [a, b] = stack.pop()!;
        cells.push([a, b]);
        const links: [boolean, number, number][] = [
          [b + 1 < cols && !edges.v[a][b], a, b + 1],
          [b > 0 && !edges.v[a]?.[b - 1], a, b - 1],
          [a + 1 < rows && !edges.h[a][b], a + 1, b],
          [a > 0 && !edges.h[a - 1]?.[b], a - 1, b],
        ];
        for (const [open, p, q] of links) {
          if (open && room[p][q] < 0) {
            room[p][q] = id;
            stack.push([p, q]);
          }
        }
      }
      if (cells.some(([a, b]) => numbers[a][b] !== cells.length)) return false;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (r + 1 < rows && room[r][k] !== room[r + 1][k] && numbers[r][k] === numbers[r + 1][k]) return false;
      if (k + 1 < cols && room[r][k] !== room[r][k + 1] && numbers[r][k] === numbers[r][k + 1]) return false;
    }
  }
  return rooms > 1;
}

/**
 * Ground truth: enumerate every split of the board into connected rooms (set partitions as
 * restricted growth strings), number each room by its size, and count the splits that
 * satisfy the rules, up to 2. A valid filling has exactly one split (its rooms are its
 * equal-number groups), so this counts fillings.
 */
function bruteForce(c: FillominoCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const n = rows * cols;
  const part = new Array(n).fill(0);
  let found = 0;
  const check = () => {
    const numbers = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const sizes = new Map<number, number>();
    for (const p of part) sizes.set(p, (sizes.get(p) ?? 0) + 1);
    for (let x = 0; x < n; x++) numbers[Math.floor(x / cols)][x % cols] = sizes.get(part[x])!;
    // Each part connected.
    for (const p of sizes.keys()) {
      const cells = part.map((q, x) => (q === p ? x : -1)).filter((x) => x >= 0);
      const seen = new Set([cells[0]]);
      const stack = [cells[0]];
      while (stack.length) {
        const x = stack.pop()!;
        const r = Math.floor(x / cols);
        const k = x % cols;
        for (const [a, b] of [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]]) {
          const y = a * cols + b;
          if (a < 0 || b < 0 || a >= rows || b >= cols || part[y] !== p || seen.has(y)) continue;
          seen.add(y);
          stack.push(y);
        }
      }
      if (seen.size !== cells.length) return;
    }
    const h = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, k) => (numbers[r][k] !== numbers[r + 1][k] ? 1 : 0)));
    const v = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, k) => (numbers[r][k] !== numbers[r][k + 1] ? 1 : 0)));
    // The walls must reproduce this split exactly (equal-size neighbours in different parts
    // would merge into one room).
    for (let x = 0; x < n; x++) {
      const r = Math.floor(x / cols);
      const k = x % cols;
      if (k + 1 < cols && part[x] !== part[x + 1] && numbers[r][k] === numbers[r][k + 1]) return;
      if (r + 1 < rows && part[x] !== part[x + cols] && numbers[r][k] === numbers[r + 1][k]) return;
    }
    if (isValidSolution(c, { numbers, edges: { h, v } })) found++;
  };
  const go = (x: number, maxPart: number) => {
    if (found >= 2) return;
    if (x === n) {
      check();
      return;
    }
    for (let p = 0; p <= maxPart + 1; p++) {
      part[x] = p;
      go(x + 1, Math.max(maxPart, p));
    }
  };
  part[0] = 0;
  go(1, 0);
  return found;
}

describe("small boards", () => {
  it("a 1x3 with a 1 and a 2 has one answer", () => {
    const c: FillominoCanon = { cells: [[1, 2, 0]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))!.numbers).toEqual([[1, 2, 2]]);
  });

  it("a board that is one room has no answer (the completion check wants a wall)", () => {
    expect(bruteForce({ cells: [[2, 0]] })).toBe(0);
    expect(classify(model({ cells: [[2, 0]] }))).toBe("none");
  });

  it("an empty 2x2 is ambiguous", () => {
    expect(countSolutions(model({ cells: [[0, 0], [0, 0]] }), 2)).toBe(2);
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 1414;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 300 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 300; i++) {
      // At most 9 cells (21147 splits).
      const rows = 1 + Math.floor(rand() * 3);
      const cols = rows === 1 ? 2 + Math.floor(rand() * 8) : rows === 2 ? 2 + Math.floor(rand() * 3) : 3;
      const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.45 ? 1 + Math.floor(rand() * 4) : 0)));
      const c: FillominoCanon = { cells };
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

describe("sample boards (docs/fillomino)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, FillominoCanon>)) {
    it(`proves the ${name} board unique by deduction alone`, () => {
      expect(classify(model(b), { maxNodes: 1 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    }, 60_000);
  }
});

describe("gate()", () => {
  it("returns the FillominoAnswer shape (numbers and walls) for a unique puzzle", () => {
    expect(gate(14, { cells: [[1, 2, 0]] })).toEqual({
      verdict: "unique",
      solution: { numbers: [[1, 2, 2]], edges: { h: [], v: [[1, 0]] } },
    });
  });

  it("reports 'none' with no solution", () => {
    expect(gate(14, { cells: [[2, 0]] })).toEqual({ verdict: "none", solution: null });
  });
});
