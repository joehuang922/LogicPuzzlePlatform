import { describe, it, expect } from "vitest";
import { TilePaintCanon } from "../types/canon";
import example from "../../../../docs/tile-paint/board-tile-paint-example.canon.json";
import {
  computeTiles,
  clueRuns,
  validateTilePaint,
  brokenClues,
  tilePaintProgress,
  tilePaintFormatProblems,
  tilePaintWarnings,
  pictureOrigin,
  normalizeClueWalls,
  hasWallBelow,
} from "./tilePaintRules";

const canon = example as TilePaintCanon;
const clone = (): TilePaintCanon => JSON.parse(JSON.stringify(canon));
// The printed answer (1 = shaded, 2 = marked).
const SOLUTION = [
  [0, 0, 0, 0, 0],
  [0, 2, 1, 2, 2],
  [0, 1, 1, 2, 2],
  [0, 2, 1, 1, 1],
  [0, 2, 1, 2, 1],
];

describe("tile paint rules", () => {
  it("builds tiles from walls, skipping clue cells", () => {
    const { ids, count } = computeTiles(canon);
    expect(ids[0][0]).toBe(-1);
    expect(ids[1][2]).toBe(ids[2][2]); // vertical domino
    expect(ids[3][2]).toBe(ids[3][3]);
    expect(ids[3][4]).toBe(ids[4][4]);
    expect(ids[1][1]).not.toBe(ids[2][1]);
    expect(count).toBe(12);
  });

  it("reads runs to the edge or the next clue cell", () => {
    const runs = clueRuns(canon);
    expect(runs).toHaveLength(8);
    const across = runs.find((r) => r.r === 1 && r.dir === "right")!;
    expect(across.cells).toEqual([[1, 1], [1, 2], [1, 3], [1, 4]]);
    const inner = clone();
    inner.cells[2][3] = { right: 1, down: null };
    const cut = clueRuns(inner).find((r) => r.r === 2 && r.c === 0)!;
    expect(cut.cells).toEqual([[2, 1], [2, 2]]);
  });

  it("accepts the printed answer and nothing less", () => {
    expect(validateTilePaint(canon, SOLUTION)).toBe(true);
    const wrong = SOLUTION.map((row) => [...row]);
    wrong[4][4] = 2;
    expect(validateTilePaint(canon, wrong)).toBe(false);
  });

  it("flags clues the decided cells break", () => {
    const states = SOLUTION.map((row) => row.map(() => 0));
    expect(brokenClues(canon, states).size).toBe(0);
    states[1][1] = 1;
    states[1][2] = 1; // row 1 wants 1
    expect(brokenClues(canon, states).has("1,0,right")).toBe(true);
    const marked = SOLUTION.map((row) => row.map((_, c) => (c === 2 ? 2 : 0)));
    expect(brokenClues(canon, marked).has("0,2,down")).toBe(true); // column wants 4
  });

  it("counts progress by tile", () => {
    expect(tilePaintProgress(canon, () => 0)).toBe(0);
    expect(tilePaintProgress(canon, (r, c) => SOLUTION[r][c])).toBe(100);
    expect(tilePaintProgress(canon, (r, c) => (r === 1 && c === 2 ? 1 : 0))).toBeCloseTo(100 / 12); // 1 of 12
  });

  it("reports format problems and warnings", () => {
    expect(tilePaintFormatProblems(canon)).toEqual([]);
    expect(tilePaintWarnings(canon)).toEqual([]);
    const dangling = clone();
    for (let r = 1; r < 5; r++) for (let c = 1; c < 4; c++) dangling.grids.v[r][c] = 0;
    for (let r = 1; r < 4; r++) for (let c = 1; c < 5; c++) dangling.grids.h[r][c] = 0;
    dangling.grids.v[2][2] = 1;
    expect(tilePaintFormatProblems(dangling).map((p) => p.message)).toEqual([
      "Wall at R3C3 doesn't close off a tile",
    ]);
    const empty = clone();
    empty.cells[1][4] = { right: 1, down: null };
    expect(tilePaintFormatProblems(empty).map((p) => p.message)).toContain(
      "The right clue at R2C5 has no cells to count"
    );
    const big = clone();
    big.cells[0][1] = { right: null, down: 9 };
    expect(tilePaintWarnings(big).map((p) => p.message)).toEqual([
      "The down clue 9 at R1C2 is more than its 4 cells",
    ]);
    const short = clone();
    short.grids.h.pop();
    expect(tilePaintFormatProblems(short)).toHaveLength(1);
  });

  it("finds the picture area and normalises clue walls", () => {
    expect(pictureOrigin(canon)).toEqual({ r0: 1, c0: 1 });
    const raw = clone();
    raw.grids.h[0] = [1, 0, 0, 0, 0];
    const norm = normalizeClueWalls(raw);
    expect(norm.grids.h[0]).toEqual([0, 1, 1, 1, 1]);
    expect(hasWallBelow(raw, 0, 1)).toBe(true);
  });
});
