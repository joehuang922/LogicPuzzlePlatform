import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { NurikabeModel, NurikabeCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: NurikabeCanon) => NurikabeModel.fromCanon(c);

/** Components of the cells passing `keep`. */
function components(rows: number, cols: number, keep: (r: number, c: number) => boolean): [number, number][][] {
  const seen = new Set<number>();
  const out: [number, number][][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!keep(r, c) || seen.has(r * cols + c)) continue;
      const comp: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      seen.add(r * cols + c);
      while (stack.length) {
        const [a, b] = stack.pop()!;
        comp.push([a, b]);
        for (const [p, q] of [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]]) {
          if (p < 0 || q < 0 || p >= rows || q >= cols || !keep(p, q) || seen.has(p * cols + q)) continue;
          seen.add(p * cols + q);
          stack.push([p, q]);
        }
      }
      out.push(comp);
    }
  }
  return out;
}

/** Independent rule check, written from the rules rather than the model. */
function isValidSolution(c: NurikabeCanon, states: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (c.cells[r][k] > 0 && states[r][k]) return false;
  for (const island of components(rows, cols, (r, k) => !states[r][k])) {
    const clues = island.map(([r, k]) => c.cells[r][k]).filter((n) => n > 0);
    if (clues.length !== 1 || clues[0] !== island.length) return false;
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let k = 0; k + 1 < cols; k++) {
      if (states[r][k] && states[r][k + 1] && states[r + 1][k] && states[r + 1][k + 1]) return false;
    }
  }
  return components(rows, cols, (r, k) => states[r][k] === 1).length <= 1;
}

/** Ground truth: every shading of the board, counted up to 2. */
function bruteForce(c: NurikabeCanon): number {
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
  it("a lone 1 in a 2x2 corner makes an L of sea", () => {
    const c: NurikabeCanon = { cells: [[1, 0], [0, 0]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[0, 1], [1, 1]]);
  });

  it("a 2 in a 2x2 corner is ambiguous (it grows right or down)", () => {
    const c: NurikabeCanon = { cells: [[2, 0], [0, 0]] };
    expect(bruteForce(c)).toBe(2);
    expect(countSolutions(model(c), 2)).toBe(2);
  });

  it("clues that must merge have no answer", () => {
    // 1x2 board with two 2s: each island needs both cells.
    const c: NurikabeCanon = { cells: [[2, 2]] };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 8080;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings), and at least one clue.
      const rows = 1 + Math.floor(rand() * 4);
      const cols = 2 + Math.floor(rand() * (rows <= 2 ? 5 : rows === 3 ? 3 : 2));
      const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.2 ? 1 + Math.floor(rand() * 4) : 0)));
      if (!cells.some((row) => row.some((n) => n > 0))) cells[Math.floor(rand() * rows)][Math.floor(rand() * cols)] = 1 + Math.floor(rand() * 3);
      const c: NurikabeCanon = { cells };
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

describe("sample boards (docs/nurikabe)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, NurikabeCanon>)) {
    it(`proves the ${name} board unique by deduction alone`, () => {
      expect(classify(model(b), { maxNodes: 1 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    });
  }
});

describe("gate()", () => {
  it("returns the NurikabeAnswer shape for a unique puzzle", () => {
    expect(gate(24, { cells: [[1, 0], [0, 0]] })).toEqual({ verdict: "unique", solution: { states: [[0, 1], [1, 1]] } });
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(24, { cells: [[2, 0], [0, 0]] })).toEqual({ verdict: "multiple", solution: null });
    expect(gate(24, { cells: [[2, 2]] })).toEqual({ verdict: "none", solution: null });
  });
});
