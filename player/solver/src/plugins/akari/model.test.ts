import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { AkariModel, AkariCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: AkariCanon) => AkariModel.fromCanon(c);

/** Independent rule check, written from the rules rather than the model. */
function isValidSolution(c: AkariCanon, bulbs: number[][]): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const open = (r: number, k: number) => r >= 0 && k >= 0 && r < rows && k < cols && c.cells[r][k] === -1;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (!open(r, k)) {
        if (bulbs[r][k]) return false;
        const n = c.cells[r][k];
        if (n >= 0 && n <= 4) {
          const around = [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]].filter(([a, b]) => open(a, b) && bulbs[a][b]).length;
          if (around !== n) return false;
        }
        continue;
      }
      // Lit (by itself or along its row/column), and a bulb sees no other bulb.
      let lit = bulbs[r][k] === 1;
      for (const [dr, dk] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        for (let a = r + dr, b = k + dk; open(a, b); a += dr, b += dk) {
          if (bulbs[a][b]) {
            if (bulbs[r][k]) return false;
            lit = true;
          }
        }
      }
      if (!lit) return false;
    }
  }
  return true;
}

/** Ground truth: every bulb placement on the open cells, counted up to 2. */
function bruteForce(c: AkariCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const openCells: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if (c.cells[r][k] === -1) openCells.push([r, k]);
  let found = 0;
  for (let mask = 0; mask < 1 << openCells.length && found < 2; mask++) {
    const bulbs = Array.from({ length: rows }, () => new Array(cols).fill(0));
    openCells.forEach(([r, k], i) => (bulbs[r][k] = (mask >> i) & 1));
    if (isValidSolution(c, bulbs)) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 4 surrounded by open cells takes all four bulbs", () => {
    const c: AkariCanon = { cells: [[5, -1, 5], [-1, 4, -1], [5, -1, 5]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[0, 1, 0], [1, 0, 1], [0, 1, 0]]);
  });

  it("a 1x3 corridor is ambiguous (one bulb anywhere lights it)", () => {
    expect(bruteForce({ cells: [[-1, -1, -1]] })).toBe(2);
    expect(countSolutions(model({ cells: [[-1, -1, -1]] }), 2)).toBe(2);
  });

  it("a 2 with one open neighbour has no answer", () => {
    expect(classify(model({ cells: [[2, -1]] }))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 1818;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      const rows = 2 + Math.floor(rand() * 3);
      const cols = 2 + Math.floor(rand() * 3);
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (rand() < 0.3 ? (rand() < 0.6 ? Math.floor(rand() * 4) : 5) : -1)),
      );
      // At most 14 open cells (16384 placements).
      if (cells.flat().filter((v) => v === -1).length > 14) cells[0][0] = 5;
      const c: AkariCanon = { cells };
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

describe("sample boards (docs/akari)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, AkariCanon>)) {
    it(`proves the ${name} board unique by deduction alone`, () => {
      expect(classify(model(b), { maxNodes: 1 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    });
  }
});

describe("gate()", () => {
  it("returns the AkariAnswer shape for a unique puzzle", () => {
    expect(gate(18, { cells: [[5, -1, 5], [-1, 4, -1], [5, -1, 5]] })).toEqual({
      verdict: "unique",
      solution: { states: [[0, 1, 0], [1, 0, 1], [0, 1, 0]] },
    });
  });

  it("reports 'none' with no solution", () => {
    expect(gate(18, { cells: [[2, -1]] })).toEqual({ verdict: "none", solution: null });
  });
});
