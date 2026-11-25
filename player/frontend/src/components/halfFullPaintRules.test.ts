import { describe, it, expect } from "vitest";
import { HalfFullPaintCanon } from "../types/canon";
import example from "../../../../docs/half-full-paint/board-half-full-paint-example.canon.json";
import exampleSolution from "../../../../docs/half-full-paint/board-half-full-paint-example.solution.json";
import p1 from "../../../../docs/half-full-paint/board-half-full-paint-1.canon.json";
import p1Solution from "../../../../docs/half-full-paint/board-half-full-paint-1.solution.json";
import p2 from "../../../../docs/half-full-paint/board-half-full-paint-2.canon.json";
import p2Solution from "../../../../docs/half-full-paint/board-half-full-paint-2.solution.json";
import p3 from "../../../../docs/half-full-paint/board-half-full-paint-3.canon.json";
import p3Solution from "../../../../docs/half-full-paint/board-half-full-paint-3.solution.json";
import {
  DOT,
  SHADED,
  brokenClues,
  circleCells,
  computeRooms,
  emptyStates,
  fromValues,
  halfFullPaintFormatProblems,
  halfFullPaintProgress,
  halfFullPaintWarnings,
  toValues,
  validateHalfFullPaint,
} from "./halfFullPaintRules";

const canon = example as HalfFullPaintCanon;
const solved = () => exampleSolution.cells.map((row) => [...row]);
const clone = (): HalfFullPaintCanon => JSON.parse(JSON.stringify(canon));

describe("half-full paint rules", () => {
  it("accepts every sample's solution", () => {
    const samples: [unknown, { cells: number[][] }][] = [
      [example, exampleSolution],
      [p1, p1Solution],
      [p2, p2Solution],
      [p3, p3Solution],
    ];
    for (const [c, s] of samples) expect(validateHalfFullPaint(c as HalfFullPaintCanon, s.cells)).toBe(true);
  });

  it("builds rooms and finds a circle's cells", () => {
    const { ids, count } = computeRooms(canon);
    expect(count).toBe(5);
    // The L-shaped room: columns 1-3 of rows 0-1 plus column 1 of rows 2-3.
    expect(new Set([ids[0][1], ids[1][3], ids[2][1], ids[3][1]]).size).toBe(1);
    expect(circleCells(canon, 1, 2)).toEqual([[0, 0], [0, 1]]);
    expect(circleCells(canon, 4, 2)).toEqual([[1, 0], [1, 1], [2, 0], [2, 1]]);
  });

  it("rejects a wrong circle, an uneven room and a split colour", () => {
    expect(validateHalfFullPaint(canon, emptyStates(canon))).toBe(false);
    const flipped = solved();
    flipped[3][2] = SHADED; // the gray circle at (7,4) now sees two shaded
    expect(validateHalfFullPaint(canon, flipped)).toBe(false);
    // A 2x2 room half shaded diagonally splits both colours.
    const square: HalfFullPaintCanon = {
      width: 2, height: 2, grids: { h: [[0, 0]], v: [[0], [0]] }, circles: [],
    };
    expect(validateHalfFullPaint(square, [[1, 0], [0, 1]])).toBe(false);
    expect(validateHalfFullPaint(square, [[1, 1], [0, 0]])).toBe(true);
    expect(validateHalfFullPaint(square, [[1, 1], [1, 0]])).toBe(false);
  });

  it("flags circles and rooms the decided cells already break", () => {
    const states = emptyStates(canon);
    expect(brokenClues(canon, states).circles.size).toBe(0);
    expect(brokenClues(canon, solved()).circles.size).toBe(0);
    expect(brokenClues(canon, solved()).rooms.size).toBe(0);
    // White circle at (2,5) between R1C3 and R2C3: one shaded already ties at best.
    states[0][2] = SHADED;
    expect(brokenClues(canon, states).circles.has(1)).toBe(true);
    // The 2-cell room R1C1-R2C1 with one shaded and one dot is half: fine.
    const s2 = emptyStates(canon);
    s2[0][0] = SHADED;
    s2[1][0] = DOT;
    expect(brokenClues(canon, s2).rooms.size).toBe(0);
    // The L room (8 cells) with 5 shaded and a dot can't be all, none or half.
    const s3 = emptyStates(canon);
    for (const [r, c] of [[0, 1], [0, 2], [0, 3], [1, 1], [1, 2]]) s3[r][c] = SHADED;
    s3[1][3] = DOT;
    expect(brokenClues(canon, s3).rooms.size).toBe(1);
  });

  it("round-trips values and computes progress", () => {
    const states = solved().map((row) => row.map((s) => (s === 1 ? SHADED : DOT)));
    expect(fromValues(canon, toValues(states))).toEqual(states);
    expect(halfFullPaintProgress(canon, emptyStates(canon))).toBe(0);
    expect(halfFullPaintProgress(canon, states)).toBe(100);
    expect(toValues(solved())["1,0"]).toBe(SHADED); // key is "col,row"
  });

  it("lists format problems and warnings", () => {
    expect(halfFullPaintFormatProblems(canon)).toEqual([]);
    expect(halfFullPaintWarnings(canon)).toEqual([]);
    const bad = clone();
    bad.circles.push({ dr: 1, dc: 1, color: 0 }, { dr: 1, dc: 2, color: 1 });
    expect(halfFullPaintFormatProblems(bad).map((p) => p.message)).toEqual([
      "Circle at (1,1) is at a cell centre",
      "Two circles at (1,2)",
    ]);
    const dangling = clone();
    dangling.grids.h[0][1] = 1; // inside the L room, closes nothing
    expect(halfFullPaintFormatProblems(dangling).map((p) => p.message)).toEqual([
      "Wall at R1C2 doesn't close off a room",
    ]);
    const open = { ...clone(), circles: [], grids: { h: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], v: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]] } };
    expect(halfFullPaintWarnings(open).map((w) => w.message)).toEqual(["No circles", "Only one room"]);
  });
});
