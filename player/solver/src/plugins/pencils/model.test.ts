import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { gate } from "../../gate";
import { PencilsModel, PencilsCanon, PencilsSolution } from "./model";
import boards from "./fixtures.json";

const model = (c: PencilsCanon) => PencilsModel.fromCanon(c);
const DIRS: Record<number, [number, number]> = { [-1]: [-1, 0], [-2]: [1, 0], [-3]: [0, -1], [-4]: [0, 1] };

/**
 * Independent rule check on the answer shape, written from the rules: every head (given
 * or placed) has a straight 1xN body behind it, walled off from everything else; its trail
 * starts at the head and runs N steps; numbers in the body are N; every number lies on a
 * body; every cell is covered exactly once.
 */
function isValidSolution(c: PencilsCanon, { trails, heads, edges }: PencilsSolution): boolean {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const inside = (r: number, k: number) => r >= 0 && k >= 0 && r < rows && k < cols;
  const wall = (r: number, k: number, a: number, b: number) =>
    a === r ? edges.v[r][Math.min(k, b)] === 1 : edges.h[Math.min(r, a)][k] === 1;
  const trail = (r: number, k: number, a: number, b: number) =>
    a === r ? trails.h[r][Math.min(k, b)] === 1 : trails.v[Math.min(r, a)][k] === 1;
  const owner = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const trailDeg = (r: number, k: number) =>
    [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]].filter(([a, b]) => inside(a, b) && trail(r, k, a, b)).length;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (c.cells[r][k] < 0 && heads[r][k] !== 0) return false;
      if (c.cells[r][k] > 0 && heads[r][k] !== 0) return false;
      const head = c.cells[r][k] < 0 ? c.cells[r][k] : heads[r][k];
      if (head === 0) continue;
      const [dr, dk] = DIRS[head];
      // Body: the straight run behind the head, up to a wall.
      const body: [number, number][] = [];
      for (let a = r - dr, b = k - dk; inside(a, b); a -= dr, b -= dk) {
        body.push([a, b]);
        const [na, nb] = [a - dr, b - dk];
        if (!inside(na, nb) || wall(a, b, na, nb)) break;
      }
      if (body.length === 0) return false;
      if (!wall(r, k, r - dr, k - dk)) return false; // the head's base
      // Walled on every other side (so the flood fill is exactly this run).
      for (const [a, b] of body) {
        for (const [p, q] of [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]]) {
          if (!inside(p, q) || body.some(([x, y]) => x === p && y === q)) continue;
          if (!wall(a, b, p, q)) return false;
        }
        if (trailDeg(a, b) !== 0) return false;
        const v = c.cells[a][b];
        if (v < 0 || heads[a][b] !== 0) return false;
        if (v > 0 && v !== body.length) return false;
      }
      // Trail from the head: an end, then n steps.
      if (trailDeg(r, k) !== 1) return false;
      const path: [number, number][] = [[r, k]];
      let [pr, pk] = [-1, -1];
      let [cr, ck] = [r, k];
      for (;;) {
        const next = [[cr - 1, ck], [cr + 1, ck], [cr, ck - 1], [cr, ck + 1]].find(
          ([a, b]) => inside(a, b) && !(a === pr && b === pk) && trail(cr, ck, a, b),
        );
        if (!next) break;
        if (path.length > rows * cols) return false;
        [pr, pk, cr, ck] = [cr, ck, next[0], next[1]];
        path.push([cr, ck]);
        if (trailDeg(cr, ck) > 2) return false;
      }
      if (path.length - 1 !== body.length) return false;
      for (const [a, b] of [...body, ...path]) owner[a][b]++;
      for (const [a, b] of path.slice(1)) if (c.cells[a][b] !== 0 || heads[a][b] !== 0) return false;
    }
  }
  return owner.every((row) => row.every((v) => v === 1));
}

/**
 * Ground truth: every assignment of none / body / trail to the edges between cells (each
 * cell ending with one or two links), turned into an answer and checked by the rules.
 */
function bruteForce(c: PencilsCanon): number {
  const rows = c.cells.length;
  const cols = c.cells[0].length;
  const edges: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (k + 1 < cols) edges.push([r * cols + k, r * cols + k + 1]);
      if (r + 1 < rows) edges.push([r * cols + k, (r + 1) * cols + k]);
    }
  }
  const lastEdge = new Array(rows * cols).fill(-1);
  edges.forEach(([a, b], i) => ((lastEdge[a] = i), (lastEdge[b] = i)));
  const val = new Array(edges.length).fill(0);
  const deg = new Array(rows * cols).fill(0);
  const num = c.cells.flat().map((v) => v > 0);
  let found = 0;
  const check = () => {
    const trailsH = Array.from({ length: rows }, () => new Array(cols - 1).fill(0));
    const trailsV = Array.from({ length: rows - 1 }, () => new Array(cols).fill(0));
    const heads = Array.from({ length: rows }, () => new Array(cols).fill(0));
    const kinds = Array.from({ length: rows * cols }, () => [] as [number, number][]); // [kind, other]
    edges.forEach(([a, b], i) => {
      if (!val[i]) return;
      kinds[a].push([val[i], b]);
      kinds[b].push([val[i], a]);
      if (val[i] === 2) {
        if (b === a + 1) trailsH[Math.floor(a / cols)][a % cols] = 1;
        else trailsV[Math.floor(a / cols)][a % cols] = 1;
      }
    });
    const bodyId = new Array(rows * cols).fill(-1);
    for (let x = 0; x < rows * cols; x++) {
      const b = kinds[x].filter(([k]) => k === 1);
      const t = kinds[x].filter(([k]) => k === 2);
      if (b.length !== 1 || t.length !== 1) continue;
      const toward = x - b[0][1]; // head minus body neighbour: the pointing direction
      const dir = toward === -cols ? -1 : toward === cols ? -2 : toward === -1 ? -3 : -4;
      if (c.cells[Math.floor(x / cols)][x % cols] === 0) heads[Math.floor(x / cols)][x % cols] = dir;
      // Mark the body: follow body links from the neighbour.
      for (let prev = x, cur = b[0][1]; ; ) {
        bodyId[cur] = x;
        const nxt = kinds[cur].find(([k, o]) => k === 1 && o !== prev);
        if (!nxt) break;
        [prev, cur] = [cur, nxt[1]];
      }
    }
    const w = (a: number, b: number) => ((bodyId[a] >= 0 || bodyId[b] >= 0) && bodyId[a] !== bodyId[b] ? 1 : 0);
    const eh = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, k) => w(r * cols + k, (r + 1) * cols + k)));
    const ev = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, k) => w(r * cols + k, r * cols + k + 1)));
    if (isValidSolution(c, { trails: { h: trailsH, v: trailsV }, heads, edges: { h: eh, v: ev } })) found++;
  };
  const go = (i: number) => {
    if (found >= 2) return;
    if (i === edges.length) return check();
    const [a, b] = edges[i];
    for (const v of [0, 1, 2]) {
      if (v && (deg[a] >= 2 || deg[b] >= 2)) continue;
      // A number lies on a body: it takes no trail.
      if (v === 2 && (num[a] || num[b])) continue;
      if (v) (deg[a]++, deg[b]++);
      const ok = (lastEdge[a] !== i || deg[a] > 0) && (lastEdge[b] !== i || deg[b] > 0);
      val[i] = v;
      if (ok) go(i + 1);
      if (v) (deg[a]--, deg[b]--);
    }
    val[i] = 0;
  };
  go(0);
  return found;
}

describe("small boards", () => {
  it("a 1x3 with a head pointing right is one pencil of length 1", () => {
    const c: PencilsCanon = { cells: [[0, -4, 0]] };
    expect(bruteForce(c)).toBe(1);
    expect(classify(model(c))).toBe("unique");
    const s = solve(model(c))!;
    expect(s.trails.h).toEqual([[0, 1]]);
    expect(isValidSolution(c, s)).toBe(true);
  });

  it("a 1x2 has no answer (a pencil needs a body, a head and a trail)", () => {
    expect(bruteForce({ cells: [[0, 0]] })).toBe(0);
    expect(classify(model({ cells: [[0, 0]] }))).toBe("none");
  });

  it("an empty 1x3 is ambiguous (the head points either way)", () => {
    expect(bruteForce({ cells: [[0, 0, 0]] })).toBe(2);
    expect(countSolutions(model({ cells: [[0, 0, 0]] }), 2)).toBe(2);
  });
});

describe("agrees with brute force on random small boards", () => {
  let seed = 808;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;

  it("matches the exhaustive count on 300 boards", () => {
    const verdicts = { 0: 0, 1: 0, 2: 0 };
    for (let i = 0; i < 300; i++) {
      const rows = 1 + Math.floor(rand() * 3);
      const cols = rows === 1 ? 3 + Math.floor(rand() * 6) : rows === 2 ? 2 + Math.floor(rand() * 4) : 3;
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => {
          const t = rand();
          return t < 0.15 ? -1 - Math.floor(rand() * 4) : t < 0.35 ? 1 + Math.floor(rand() * 3) : 0;
        }),
      );
      const c: PencilsCanon = { cells };
      const expected = bruteForce(c);
      const got = countSolutions(model(c), 2);
      expect({ c, got }).toEqual({ c, got: expected });
      verdicts[expected as 0 | 1 | 2]++;
      if (expected === 1) expect(isValidSolution(c, solve(model(c))!)).toBe(true);
    }
    expect(verdicts[0]).toBeGreaterThan(0);
    expect(verdicts[1]).toBeGreaterThan(0);
    expect(verdicts[2]).toBeGreaterThan(0);
  }, 120_000);
});

describe("sample boards (docs/pencils)", () => {
  for (const [name, b] of Object.entries(boards as unknown as Record<string, PencilsCanon>)) {
    // The small board falls to deduction alone; the bigger ones take a short search.
    it(`proves the ${name} board unique`, () => {
      expect(classify(model(b), name === "small" ? { maxNodes: 1 } : {})).toBe("unique");
      expect(isValidSolution(b, solve(model(b))!)).toBe(true);
    }, 120_000);
  }
});

describe("gate()", () => {
  it("returns the PencilsAnswer shape for a unique puzzle", () => {
    expect(gate(8, { cells: [[0, -4, 0]] })).toEqual({
      verdict: "unique",
      solution: { trails: { h: [[0, 1]], v: [] }, heads: [[0, 0, 0]], edges: { h: [], v: [[1, 0]] } },
    });
  });

  it("reports 'none' with no solution", () => {
    expect(gate(8, { cells: [[0, 0]] })).toEqual({ verdict: "none", solution: null });
  });
});
