import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { HeyawakeModel, HeyawakeCanon } from "./model";
import boards from "./fixtures.json";

const model = (c: HeyawakeCanon) => HeyawakeModel.fromCanon(c);

/** Room id per cell, from the rectangles. */
function roomGrid(c: HeyawakeCanon): number[][] {
  const g = Array.from({ length: c.height }, () => new Array(c.width).fill(-1));
  c.rooms.forEach((rm, i) => {
    for (let r = rm.r; r < rm.r + rm.h; r++) for (let k = rm.c; k < rm.c + rm.w; k++) g[r][k] = i;
  });
  return g;
}

/** Independent rule check, written from the rules rather than the model. */
function isValidSolution(c: HeyawakeCanon, states: number[][]): boolean {
  const rows = c.height;
  const cols = c.width;
  const room = roomGrid(c);
  const count = new Array(c.rooms.length).fill(0);
  let whites = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (states[r][k]) {
        count[room[r][k]]++;
        if ((k + 1 < cols && states[r][k + 1]) || (r + 1 < rows && states[r + 1][k])) return false;
      } else {
        whites++;
        start ??= [r, k];
      }
    }
  }
  if (c.rooms.some((rm, i) => rm.clue != null && count[i] !== rm.clue)) return false;
  // No white run through three rooms: count the room changes along each white run.
  const runOk = (cells: [number, number][]) => {
    let rooms = 0;
    let last = -1;
    for (const [r, k] of cells) {
      if (states[r][k]) {
        rooms = 0;
        last = -1;
        continue;
      }
      if (room[r][k] !== last) {
        rooms++;
        last = room[r][k];
      }
      if (rooms >= 3) return false;
    }
    return true;
  };
  for (let r = 0; r < rows; r++) if (!runOk(Array.from({ length: cols }, (_, k) => [r, k]))) return false;
  for (let k = 0; k < cols; k++) if (!runOk(Array.from({ length: rows }, (_, r) => [r, k]))) return false;
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
function bruteForce(c: HeyawakeCanon): number {
  let found = 0;
  const n = c.height * c.width;
  for (let mask = 0; mask < 1 << n && found < 2; mask++) {
    const states = Array.from({ length: c.height }, (_, r) => Array.from({ length: c.width }, (_, k) => (mask >> (r * c.width + k)) & 1));
    if (isValidSolution(c, states)) found++;
  }
  return found;
}

describe("small boards", () => {
  it("a 1x4 row of four 1-cell rooms shades both ends", () => {
    // Runs of three rooms (cells 0-2 and 1-3) each need a shaded cell, and in a single
    // row any shaded middle cell cuts the white cells apart: only the two ends work.
    const c: HeyawakeCanon = { width: 4, height: 1, rooms: [0, 1, 2, 3].map((k) => ({ r: 0, c: k, w: 1, h: 1, clue: null })) };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    expect(solve(model(c))).toEqual([[1, 0, 0, 1]]);
  });

  it("a number that forces a middle cell shaded has no answer in a single row", () => {
    const c: HeyawakeCanon = {
      width: 4,
      height: 1,
      rooms: [
        { r: 0, c: 0, w: 1, h: 1, clue: null },
        { r: 0, c: 1, w: 1, h: 1, clue: 1 },
        { r: 0, c: 2, w: 1, h: 1, clue: null },
        { r: 0, c: 3, w: 1, h: 1, clue: null },
      ],
    };
    expect(bruteForce(c)).toBe(0);
    expect(classify(model(c))).toBe("none");
  });

  it("a room numbered beyond what fits has no answer", () => {
    const c: HeyawakeCanon = { width: 2, height: 1, rooms: [{ r: 0, c: 0, w: 2, h: 1, clue: 2 }] };
    expect(classify(model(c))).toBe("none");
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 4321;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  /** Tile a rectangle with rooms by random guillotine cuts. */
  function tile(r: number, c: number, h: number, w: number, out: HeyawakeCanon["rooms"]): void {
    if (h * w === 1 || rand() < 0.3) {
      const cells = h * w;
      out.push({ r, c, w, h, clue: rand() < 0.5 ? Math.floor(rand() * Math.min(3, Math.ceil(cells / 2) + 1)) : null });
      return;
    }
    if ((rand() < 0.5 && h > 1) || w === 1) {
      const cut = 1 + Math.floor(rand() * (h - 1));
      tile(r, c, cut, w, out);
      tile(r + cut, c, h - cut, w, out);
    } else {
      const cut = 1 + Math.floor(rand() * (w - 1));
      tile(r, c, h, cut, out);
      tile(r, c + cut, h, w - cut, out);
    }
  }

  it("matches the exhaustive count on 400 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 400; i++) {
      // At most 12 cells (4096 shadings).
      const height = 1 + Math.floor(rand() * 4);
      const width = 2 + Math.floor(rand() * (height === 1 ? 6 : height === 2 ? 5 : height === 3 ? 3 : 2));
      const c: HeyawakeCanon = { width, height, rooms: [] };
      tile(0, 0, height, width, c.rooms);
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

describe("sample boards (docs/heyawake)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, HeyawakeCanon>)) {
    it(`proves the ${name} board unique`, () => {
      expect(classify(model(b), { deadline: Date.now() + 20_000 })).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    }, 30_000);
  }
});

describe("gate()", () => {
  it("returns the HeyawakeAnswer shape for a unique puzzle", () => {
    const c = (boards as unknown as Record<string, HeyawakeCanon>)["10x10"];
    const result = gate(21, c)!;
    expect(result.verdict).toBe("unique");
    expect(Object.keys(result.solution as object)).toEqual(["states"]);
    expect(isValidSolution(c, (result.solution as { states: number[][] }).states)).toBe(true);
  });

  it("reports 'none' with no solution", () => {
    expect(gate(21, { width: 2, height: 1, rooms: [{ r: 0, c: 0, w: 2, h: 1, clue: 2 }] })).toEqual({ verdict: "none", solution: null });
  });
});
