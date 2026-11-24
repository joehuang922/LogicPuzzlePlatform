import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  Cell,
  edgesFromPath,
  isPicturesqueMazeSolved,
  pathEndsInDeadEnd,
  pathFromEdges,
  picturesqueMazeFormatProblems,
  picturesqueMazeProgress,
  picturesqueMazeWarnings,
  solveMaze,
  stepToward,
  tiedRouteCells,
} from "./picturesqueMazeRules";
import { PicturesqueMazeCanon } from "../types/canon";

// The doc's 3x4 example, a perfect maze.
const canon: PicturesqueMazeCanon = {
  width: 4,
  height: 3,
  walls: {
    h: [[0, 1, 0, 0], [0, 1, 1, 0]],
    v: [[0, 1, 0], [0, 0, 1], [0, 0, 1]],
  },
  entrance: { side: "top", index: 0 },
  exit: { side: "bottom", index: 3 },
};
const route: Cell[] = [[0, 0], [1, 0], [1, 1], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3]];
const docAnswer = {
  h: [[0, 0, 1], [1, 1, 0], [0, 0, 0]],
  v: [[1, 0, 1, 1], [0, 0, 0, 1]],
};

const clone = (c: PicturesqueMazeCanon): PicturesqueMazeCanon => JSON.parse(JSON.stringify(c));

describe("solveMaze", () => {
  it("finds the doc's route, uniquely", () => {
    expect(solveMaze(canon)).toEqual({ route, unique: true });
  });
  it("reports no route when walled off", () => {
    const c = clone(canon);
    c.walls.h[0][0] = 1;
    c.walls.v[0][0] = 1;
    expect(solveMaze(c).route).toBeNull();
  });
});

describe("format problems", () => {
  it("accepts the doc example", () => {
    expect(picturesqueMazeFormatProblems(canon)).toEqual([]);
  });
  it("flags the same opening, an opening off the board, bad wall shapes", () => {
    expect(picturesqueMazeFormatProblems({ ...canon, exit: { side: "top", index: 0 } })).toEqual([
      "Entrance and exit are the same opening",
    ]);
    expect(picturesqueMazeFormatProblems({ ...canon, exit: { side: "bottom", index: 4 } })[0]).toMatch(/off the board/);
    const c = clone(canon);
    c.walls.h.pop();
    expect(picturesqueMazeFormatProblems(c)[0]).toMatch(/Wall arrays/);
  });
  it("flags a tied shortest route and marks where routes part", () => {
    const open: PicturesqueMazeCanon = {
      width: 2,
      height: 2,
      walls: { h: [[0, 0]], v: [[0], [0]] },
      entrance: { side: "top", index: 0 },
      exit: { side: "bottom", index: 1 },
    };
    expect(picturesqueMazeFormatProblems(open)).toEqual(["The shortest route is not unique"]);
    expect(tiedRouteCells(open).sort()).toEqual([[0, 1], [1, 0]]);
  });
});

describe("warnings", () => {
  it("is quiet on a perfect maze", () => {
    expect(picturesqueMazeWarnings(canon)).toEqual({ loopCells: [], unreachable: [] });
  });
  it("marks loop cells and sealed cells", () => {
    const c = clone(canon);
    c.walls.h[0][1] = 0; // (0,1)-(1,1) opens a loop (0,0)(0,1)(1,1)(1,0)
    c.walls.v[2][1] = 1; // (2,1)-(2,2)
    c.walls.h[1][2] = 1; // already 1: (2,2) now sealed
    const w = picturesqueMazeWarnings(c);
    expect(w.loopCells.sort()).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(w.unreachable).toEqual([[2, 2]]);
  });
});

describe("path", () => {
  it("round-trips through edges", () => {
    const edges = edgesFromPath(route, 4, 3);
    expect(edges).toEqual(docAnswer);
    expect(pathFromEdges(canon, edges)).toEqual(route);
  });
  it("is solved only by the full route with no stray edges", () => {
    expect(isPicturesqueMazeSolved(canon, docAnswer)).toBe(true);
    expect(isPicturesqueMazeSolved(canon, edgesFromPath(route.slice(0, -1), 4, 3))).toBe(false);
    const extra = edgesFromPath(route, 4, 3);
    extra.h[2][0] = 1;
    expect(isPicturesqueMazeSolved(canon, extra)).toBe(false);
  });
  it("progress counts path length, capped at 99", () => {
    expect(picturesqueMazeProgress(canon, null)).toBe(0);
    expect(picturesqueMazeProgress(canon, edgesFromPath(route.slice(0, 4), 4, 3))).toBe(50);
    // A wrong path as long as the route still caps at 99.
    const wrong: Cell[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
    expect(picturesqueMazeProgress(canon, edgesFromPath(wrong, 4, 3))).toBe(63);
    expect(picturesqueMazeProgress(canon, docAnswer)).toBe(100);
  });
  it("detects a dead end at the path's end", () => {
    expect(pathEndsInDeadEnd(canon, [[0, 0], [0, 1]])).toBe(true);
    expect(pathEndsInDeadEnd(canon, [[0, 0], [1, 0]])).toBe(false);
    expect(pathEndsInDeadEnd(canon, route)).toBe(false);
  });
  it("steps toward the pointer only through open sides", () => {
    // From (1,1): right is open, up is a wall.
    expect(stepToward(canon, [1, 1], 1.6, 2.4)).toEqual([1, 2]);
    expect(stepToward(canon, [1, 1], 0.4, 1.5)).toBeNull();
    // Mostly up with a little right: still refused, not sent sideways.
    expect(stepToward(canon, [1, 1], 0.3, 1.9)).toBeNull();
  });
});

describe("docs samples", () => {
  // The parser's canons for the scans (docs/picturesque-maze): perfect mazes.
  const docs = resolve(__dirname, "../../../../docs/picturesque-maze");
  for (const name of ["board-picturesque-maze-1", "board-picturesque-maze-2", "board-picturesque-maze-3"]) {
    it(`${name} is a valid, perfect maze`, () => {
      const sample = JSON.parse(readFileSync(resolve(docs, `${name}.canon.json`), "utf8")) as PicturesqueMazeCanon;
      expect(picturesqueMazeFormatProblems(sample)).toEqual([]);
      expect(picturesqueMazeWarnings(sample)).toEqual({ loopCells: [], unreachable: [] });
      const { route } = solveMaze(sample);
      expect(isPicturesqueMazeSolved(sample, edgesFromPath(route!, sample.width, sample.height))).toBe(true);
    });
  }
});
