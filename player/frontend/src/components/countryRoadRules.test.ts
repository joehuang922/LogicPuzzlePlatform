import { describe, it, expect } from "vitest";
import { CountryRoadCanon } from "../types/canon";
import example from "../../../../docs/country-road/board-country-road-example.canon.json";
import {
  CROSS,
  DOT,
  brokenClues,
  computeRooms,
  countryRoadFormatProblems,
  countryRoadProgress,
  countryRoadWarnings,
  emptyLoop,
  fromValues,
  isSingleLoop,
  toValues,
  validateCountryRoad,
  Loop,
} from "./countryRoadRules";

const canon = example as CountryRoadCanon;
const clone = (): CountryRoadCanon => JSON.parse(JSON.stringify(canon));
// The doc's answer: the outer ring of the 3x3 board.
const ring = (): Loop => ({
  h: [[1, 1], [0, 0], [1, 1]],
  v: [[1, 0, 1], [1, 0, 1]],
});

describe("country road rules", () => {
  it("builds rooms from walls", () => {
    const { ids, count } = computeRooms(canon);
    expect(count).toBe(4);
    expect(new Set([ids[0][0], ids[0][1], ids[1][0], ids[1][1]]).size).toBe(1);
    expect(ids[1][2]).toBe(ids[2][2]);
    expect(ids[2][1]).toBe(ids[2][2]);
    expect(ids[0][2]).not.toBe(ids[1][2]);
  });

  it("accepts the doc's answer", () => {
    expect(isSingleLoop(3, 3, ring())).toBe(true);
    expect(validateCountryRoad(canon, ring())).toBe(true);
  });

  it("rejects each broken rule", () => {
    const open = ring();
    open.h[0][0] = 0;
    expect(validateCountryRoad(canon, open)).toBe(false); // not a loop
    const wrongNumber = clone();
    wrongNumber.cells[2][2] = 2;
    expect(validateCountryRoad(wrongNumber, ring())).toBe(false); // the L uses 3 cells
    // A 2x2 loop in the top-left room misses the other rooms.
    const small: Loop = { h: [[1, 0], [1, 0], [0, 0]], v: [[1, 1, 0], [0, 0, 0]] };
    expect(isSingleLoop(3, 3, small)).toBe(true);
    expect(validateCountryRoad(canon, small)).toBe(false);
    // Unused cells across a wall: one big room each side of a single wall line.
    const split: CountryRoadCanon = {
      cells: [[0, 0], [0, 0], [0, 0]],
      grids: { h: [[0, 0], [0, 0]], v: [[1], [1], [1]] },
    };
    const twoRooms: Loop = { h: [[1], [0], [1]], v: [[1, 1], [1, 1]] };
    expect(validateCountryRoad(split, twoRooms)).toBe(true);
    const short: Loop = { h: [[1], [1], [0]], v: [[1, 1], [0, 0]] };
    expect(validateCountryRoad(split, short)).toBe(false); // (2,0) and (2,1) unused across the wall
  });

  it("round-trips player values", () => {
    const marks = [[0, 0, 0], [0, CROSS, 0], [DOT, 0, 0]];
    const values = toValues(ring(), marks);
    expect(values["h:0,0"]).toBe(1);
    expect(values["m:1,1"]).toBe(CROSS);
    expect(fromValues(3, 3, values)).toEqual({ loop: ring(), marks });
  });

  it("flags what the decided marks break", () => {
    const loop = emptyLoop(3, 3);
    const none = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    expect(brokenClues(canon, loop, none).numbers.size).toBe(0);
    // Four loop cells in the top-left room (number 3).
    const four: Loop = { h: [[1, 0], [1, 0], [0, 0]], v: [[1, 1, 0], [0, 0, 0]] };
    expect(brokenClues(canon, four, none).numbers.has("0,0")).toBe(true);
    // × cells across a wall.
    const crosses = [[0, 0, CROSS], [0, 0, CROSS], [0, 0, 0]];
    expect([...brokenClues(canon, loop, crosses).crosses].sort()).toEqual(["0,2", "1,2"]);
    // The top-left room left three times (to the right twice, down once).
    const exits = emptyLoop(3, 3);
    exits.h[0][1] = 1;
    exits.h[1][1] = 1;
    exits.v[1][0] = 1;
    const topLeft = computeRooms(canon).ids[0][0];
    expect(brokenClues(canon, exits, none).rooms.has(topLeft)).toBe(true);
  });

  it("counts decided cells for progress", () => {
    const none = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    expect(countryRoadProgress(canon, emptyLoop(3, 3), none)).toBe(0);
    expect(countryRoadProgress(canon, ring(), [[0, 0, 0], [0, CROSS, 0], [0, 0, 0]])).toBe(100);
    expect(countryRoadProgress(canon, emptyLoop(3, 3), [[DOT, 0, 0], [0, 0, 0], [0, 0, 0]])).toBeCloseTo(100 / 9);
  });

  it("reports format problems and warnings", () => {
    expect(countryRoadFormatProblems(canon)).toEqual([]);
    expect(countryRoadWarnings(canon)).toEqual([]);
    const two = clone();
    two.cells[1][1] = 2;
    expect(countryRoadFormatProblems(two).map((p) => p.message)).toEqual([
      "Two numbers in one room (R1C1 and R2C2)",
    ]);
    const dangling = clone();
    dangling.grids.v[0][0] = 1;
    expect(countryRoadFormatProblems(dangling).map((p) => p.message)).toEqual([
      "Wall at R1C1 doesn't close off a room",
    ]);
    const big = clone();
    big.cells[0][2] = 2;
    expect(countryRoadWarnings(big).map((p) => p.message)).toEqual([
      "Number 2 at R1C3 is more than its room's 1 cells",
    ]);
    const short = clone();
    short.grids.h.pop();
    expect(countryRoadFormatProblems(short)).toHaveLength(1);
  });
});
