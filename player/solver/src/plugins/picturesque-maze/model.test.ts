import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classify } from "../../drivers";
import { gate } from "../../gate";
import { PicturesqueMazeModel, PicturesqueMazeCanon, PicturesqueMazeEdges } from "./model";

/** An open w x h room with the given walls, entrance top-left, exit bottom-right. */
function maze(
  width: number,
  height: number,
  hWalls: [number, number][] = [],
  vWalls: [number, number][] = [],
): PicturesqueMazeCanon {
  const h = Array.from({ length: height - 1 }, () => new Array(width).fill(0));
  const v = Array.from({ length: height }, () => new Array(width - 1).fill(0));
  for (const [r, c] of hWalls) h[r][c] = 1;
  for (const [r, c] of vWalls) v[r][c] = 1;
  return {
    width,
    height,
    walls: { h, v },
    entrance: { side: "top", index: 0 },
    exit: { side: "bottom", index: width - 1 },
  };
}

/** Ground truth: BFS distances, then count shortest routes by DP (capped at 2). */
function shortestRouteCount(c: PicturesqueMazeCanon): { length: number; count: number } {
  const { width: w, height: hgt, walls } = c;
  const start = c.entrance.index; // tests use top entrances
  const goal = (hgt - 1) * w + c.exit.index; // and bottom exits
  const dist = new Array(w * hgt).fill(-1);
  const ways = new Array(w * hgt).fill(0);
  dist[start] = 0;
  ways[start] = 1;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const r = Math.floor(cur / w);
    const k = cur % w;
    const nbs: number[] = [];
    if (r > 0 && !walls.h[r - 1][k]) nbs.push(cur - w);
    if (r < hgt - 1 && !walls.h[r][k]) nbs.push(cur + w);
    if (k > 0 && !walls.v[r][k - 1]) nbs.push(cur - 1);
    if (k < w - 1 && !walls.v[r][k]) nbs.push(cur + 1);
    for (const nb of nbs) {
      if (dist[nb] < 0) {
        dist[nb] = dist[cur] + 1;
        q.push(nb);
      }
      if (dist[nb] === dist[cur] + 1) ways[nb] = Math.min(2, ways[nb] + ways[cur]);
    }
  }
  return { length: dist[goal] + 1, count: dist[goal] < 0 ? 0 : ways[goal] };
}

/** The solution's segments form one path from the entrance to the exit through open passages. */
function routeCells(c: PicturesqueMazeCanon, e: PicturesqueMazeEdges): number {
  let segments = 0;
  for (let r = 0; r < c.height; r++) {
    for (let k = 0; k < c.width - 1; k++) {
      if (e.h[r][k]) {
        expect(c.walls.v[r][k]).toBe(0);
        segments++;
      }
    }
  }
  for (let r = 0; r < c.height - 1; r++) {
    for (let k = 0; k < c.width; k++) {
      if (e.v[r][k]) {
        expect(c.walls.h[r][k]).toBe(0);
        segments++;
      }
    }
  }
  return segments + 1;
}

const sample = (n: number): PicturesqueMazeCanon =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../../../../../docs/picturesque-maze/board-picturesque-maze-${n}.canon.json`), "utf8"),
  );

describe("picturesque maze model", () => {
  it("a corridor is unique and solved without search", () => {
    // 3x2 snake: (0,0)->(0,1)->(0,2)->(1,2), with (1,0)-(1,1) walled off from the top row.
    const c = maze(3, 2, [[0, 0], [0, 1]]);
    const m = PicturesqueMazeModel.fromCanon(c);
    expect(m.isSolved()).toBe(true);
    expect(m.route()).toEqual([[0, 0], [0, 1], [0, 2], [1, 2]]);
    expect(m.solution()).toEqual({ h: [[1, 1], [0, 0]], v: [[0, 0, 1]] });
  });

  it("an open room has several shortest routes", () => {
    expect(classify(PicturesqueMazeModel.fromCanon(maze(3, 3)))).toBe("multiple");
  });

  it("a longer detour does not spoil uniqueness", () => {
    // 3x3, nothing goes down from the top row but its right end: the only shortest route
    // is right, right, down, down. The open 2x2 block at the bottom right is a loop whose
    // other ways round are longer.
    const loop = maze(3, 3, [[0, 0], [0, 1]]);
    expect(shortestRouteCount(loop)).toEqual({ length: 5, count: 1 });
    const m = PicturesqueMazeModel.fromCanon(loop);
    expect(classify(m)).toBe("unique");
    expect(m.route()).toEqual([[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]);
  });

  it("no route when the exit is walled off", () => {
    const c = maze(2, 2, [[0, 1]], [[1, 0]]);
    expect(classify(PicturesqueMazeModel.fromCanon(c))).toBe("none");
  });

  it("agrees with a route count on random small mazes", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const seen = { 0: 0, 1: 0, 2: 0 } as Record<number, number>;
    for (let t = 0; t < 400; t++) {
      const w = 2 + Math.floor(rand() * 4);
      const h = 2 + Math.floor(rand() * 4);
      const c = maze(w, h);
      for (const row of c.walls.h) for (let k = 0; k < row.length; k++) row[k] = rand() < 0.45 ? 1 : 0;
      for (const row of c.walls.v) for (let k = 0; k < row.length; k++) row[k] = rand() < 0.45 ? 1 : 0;
      const truth = shortestRouteCount(c);
      seen[truth.count]++;
      const result = gate(44, c)!;
      expect(result.verdict).toBe(["none", "unique", "multiple"][truth.count]);
      if (truth.count === 1) {
        const edges = (result.solution as { edges: PicturesqueMazeEdges }).edges;
        expect(routeCells(c, edges)).toBe(truth.length);
      }
    }
    expect(seen[0] && seen[1] && seen[2]).toBeTruthy();
  });

  it.each([1, 2, 3])("sample %i has a unique shortest route", (n) => {
    const c = sample(n);
    const result = gate(44, c)!;
    expect(result.verdict).toBe("unique");
    const edges = (result.solution as { edges: PicturesqueMazeEdges }).edges;
    expect(edges.h.length).toBe(c.height);
    expect(edges.v.length).toBe(c.height - 1);
    expect(routeCells(c, edges)).toBeGreaterThan(1);
  });
});
