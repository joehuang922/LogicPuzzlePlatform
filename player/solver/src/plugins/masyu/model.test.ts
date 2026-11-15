import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { MasyuModel, MasyuCanon, MasyuEdges } from "./model";
import boards from "./fixtures.json";

/** Rows of ".", "o" (white), "x" (black) -> canon. */
function canon(rows: string[]): MasyuCanon {
  return { cells: rows.map((row) => row.split("").map((ch) => (ch === "o" ? 1 : ch === "x" ? 2 : 0))) };
}

const model = (rows: string[]) => MasyuModel.fromCanon(canon(rows));

/**
 * Independent rule check, written from the rules rather than the model: every cell has
 * degree 0 or 2, the lines form one loop, white circles go straight with a turn in a
 * neighbour, black circles turn and go straight through both neighbours.
 */
function isValidSolution(c: MasyuCanon, { h, v }: MasyuEdges): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const links = (r: number, cc: number) => {
    const d: string[] = [];
    if (cc > 0 && h[r][cc - 1]) d.push("L");
    if (cc < cols - 1 && h[r][cc]) d.push("R");
    if (r > 0 && v[r - 1][cc]) d.push("U");
    if (r < rows - 1 && v[r][cc]) d.push("D");
    return d;
  };
  const straight = (d: string[]) => d.length === 2 && (d.join("") === "LR" || d.join("") === "UD");
  const turn = (d: string[]) => d.length === 2 && !straight(d);
  const step: Record<string, [number, number]> = { L: [0, -1], R: [0, 1], U: [-1, 0], D: [1, 0] };

  let start: [number, number] | null = null;
  let onCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      const d = links(r, cc);
      if (d.length !== 0 && d.length !== 2) return false;
      if (d.length === 2) {
        onCells++;
        start ??= [r, cc];
      }
      const kind = c.cells[r][cc];
      if (kind === 1) {
        if (!straight(d)) return false;
        const turns = d.some((dir) => turn(links(r + step[dir][0], cc + step[dir][1])));
        if (!turns) return false;
      } else if (kind === 2) {
        if (!turn(d)) return false;
        if (!d.every((dir) => straight(links(r + step[dir][0], cc + step[dir][1])))) return false;
      }
    }
  }
  if (!start) return false;
  // Walk the loop from `start`; one loop iff it visits every cell with lines.
  let [pr, pc] = [-1, -1];
  let [r, cc] = start;
  let visited = 0;
  do {
    visited++;
    const next = links(r, cc)
      .map((dir) => [r + step[dir][0], cc + step[dir][1]] as [number, number])
      .find(([nr, nc]) => nr !== pr || nc !== pc)!;
    [pr, pc] = [r, cc];
    [r, cc] = next;
  } while (r !== start[0] || cc !== start[1]);
  return visited === onCells;
}

/** Count solutions (capped at 2) by trying every edge subset: the ground truth. */
function bruteForce(c: MasyuCanon): number {
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
  const popcount = (x: number) => {
    let n = 0;
    for (; x; x &= x - 1) n++;
    return n;
  };
  const circle = c.cells.flat().map((k) => k !== 0);
  let found = 0;
  for (let mask = 1; mask < 1 << total && found < 2; mask++) {
    if (!incident.every((bits, i) => {
      const d = popcount(mask & bits);
      return d === 2 || (d === 0 && !circle[i]);
    })) continue;
    const bit = (i: number) => (mask >> i) & 1;
    const h = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, k) => bit(r * (cols - 1) + k)));
    const v = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, k) => bit(hn + r * cols + k)));
    if (isValidSolution(c, { h, v })) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 3x3 with two black top corners has only the full ring", () => {
    // One black corner alone also allows a notched loop through the centre; the second
    // corner rules it out.
    const rows = ["x.x", "...", "..."];
    expect(bruteForce(canon(rows))).toBe(1);
    expect(classify(model(rows))).toBe("unique");
    const s = solve(model(rows))!;
    expect(s).toEqual({ h: [[1, 1], [0, 0], [1, 1]], v: [[1, 0, 1], [1, 0, 1]] });
    expect(isValidSolution(canon(rows), s)).toBe(true);
  });

  it("a white circle in a 2x2 has no loop (every cell of it is a corner)", () => {
    expect(classify(model(["o.", ".."]))).toBe("none");
  });

  it("a board without circles is ambiguous", () => {
    expect(countSolutions(model(["...", "..."]), 2)).toBe(2);
  });

  it("a one-row board has no loop", () => {
    expect(classify(model(["o.x"]))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  // Deterministic LCG so a failure reproduces.
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  const cases: string[][] = [];
  for (let i = 0; i < 400; i++) {
    // 3x3, 3x4 or 4x3: at most 17 edges, so 131k subsets to enumerate.
    const rows = 3 + Math.floor(rand() * 2);
    const cols = rows === 4 ? 3 : 3 + Math.floor(rand() * 2);
    const density = 0.15 + rand() * 0.3;
    cases.push(
      Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (rand() < density ? (rand() < 0.5 ? "o" : "x") : ".")).join(""),
      ),
    );
  }

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (const rows of cases) {
      const expected = bruteForce(canon(rows));
      const got = countSolutions(model(rows), 2);
      expect({ rows, got }).toEqual({ rows, got: expected });
      verdicts[expected as 0 | 1 | 2]++;
      if (expected === 1) expect(isValidSolution(canon(rows), solve(model(rows))!)).toBe(true);
    }
    // The sample must exercise every verdict, or it proves little.
    expect(verdicts[0]).toBeGreaterThan(0);
    expect(verdicts[1]).toBeGreaterThan(0);
    expect(verdicts[2]).toBeGreaterThan(0);
  }, 60_000);
});

describe("sample boards (docs/masyu)", () => {
  // Every sample is settled by propagation and probing at construction: a tiny node
  // budget makes sure the verdict comes from deduction, not a lucky search.
  const budget = { maxNodes: 50 };

  for (const [name, rows] of Object.entries(boards as Record<string, string[]>)) {
    it(`proves the ${rows.length}x${rows[0].length} '${name}' board unique`, () => {
      const m = model(rows);
      expect(classify(m, budget)).toBe("unique");
      expect(isValidSolution(canon(rows), solve(m, budget)!)).toBe(true);
    }, 30_000);
  }
});

describe("gate()", () => {
  it("returns the MasyuAnswer shape for a unique puzzle", () => {
    const result = gate(7, canon(["x.x", "...", "..."]));
    expect(result).toEqual({
      verdict: "unique",
      solution: { edges: { h: [[1, 1], [0, 0], [1, 1]], v: [[1, 0, 1], [1, 0, 1]] } },
    });
  });

  it("reports 'multiple' and 'none' with no solution", () => {
    expect(gate(7, canon(["...", "..."]))).toEqual({ verdict: "multiple", solution: null });
    expect(gate(7, canon(["o.", ".."]))).toEqual({ verdict: "none", solution: null });
  });
});
