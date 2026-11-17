import { describe, expect, it } from "vitest";
import {
  brokenClues,
  circleCells,
  ropeHolds,
  validateZebraRope,
  zebraRopeFormatProblems,
} from "./zebraRopeRules";
import { ZebraRopeCanon } from "../types/canon";

// 3x3: a diagonal rope (0,0)-(1,1)-(2,2), a vertical rope down column 2, a black circle
// on the corner between rows 0-1 and cols 0-1, a gray circle on the edge (1,1)|(1,2).
const canon: ZebraRopeCanon = {
  width: 3,
  height: 3,
  ropes: [
    [[0, 0], [1, 1], [2, 2]],
    [[0, 2], [1, 2], [2, 2]],
  ],
  circles: [
    { dr: 2, dc: 2, color: 1 },
    { dr: 3, dc: 4, color: 2 },
  ],
};
// Diagonal alternates (shaded, unshaded, shaded); column 2 alternates too.
const answer = [
  [1, 1, 1],
  [1, 0, 1],
  [0, 0, 1],
];

describe("circleCells", () => {
  it("returns the 2 cells of an edge and the 4 of a corner", () => {
    expect(circleCells({ dr: 3, dc: 4, color: 0 })).toEqual([[1, 1], [1, 2]]);
    expect(circleCells({ dr: 4, dc: 3, color: 0 })).toEqual([[1, 1], [2, 1]]);
    expect(circleCells({ dr: 2, dc: 2, color: 0 })).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });
});

describe("ropeHolds", () => {
  it("accepts uniform and alternating ropes", () => {
    expect(ropeHolds([true, true, true])).toBe(true);
    expect(ropeHolds([false, false])).toBe(true);
    expect(ropeHolds([false, true, false, true])).toBe(true);
  });
  it("rejects anything else", () => {
    expect(ropeHolds([true, true, false])).toBe(false);
    expect(ropeHolds([false, true, true, false])).toBe(false);
  });
});

describe("validateZebraRope", () => {
  it("accepts a solved board, with marks counting as unshaded", () => {
    expect(validateZebraRope(canon, answer)).toBe(true);
    const marked = answer.map((row) => row.map((v) => (v === 0 ? 2 : v)));
    expect(validateZebraRope(canon, marked)).toBe(true);
  });
  it("rejects a broken circle", () => {
    // Corner (0,0),(0,1),(1,0),(1,1) needs more shaded than unshaded.
    const bad = [
      [1, 0, 1],
      [0, 0, 0],
      [0, 0, 1],
    ];
    expect(validateZebraRope({ ...canon, ropes: [] }, bad)).toBe(false);
  });
  it("rejects a broken rope", () => {
    const bad = answer.map((row) => [...row]);
    bad[2][2] = 0; // diagonal becomes shaded, unshaded, unshaded
    expect(validateZebraRope({ ...canon, circles: [] }, bad)).toBe(false);
  });
});

describe("brokenClues", () => {
  it("flags nothing on an empty board", () => {
    const empty = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const { circles, ropes } = brokenClues(canon, empty);
    expect(circles.size + ropes.size).toBe(0);
  });
  it("flags a rope only once no pattern fits the decided cells", () => {
    // (0,2) shaded, (1,2) shaded: still all-shaded possible.
    const partial = [[0, 0, 1], [0, 0, 1], [0, 0, 0]];
    expect(brokenClues(canon, partial).ropes.has(1)).toBe(false);
    // (0,2) shaded, (2,2) marked: alternating needs equal ends, uniform needs equal too.
    const broken = [[0, 0, 1], [0, 0, 0], [0, 0, 2]];
    expect(brokenClues(canon, broken).ropes.has(1)).toBe(true);
  });
  it("flags a circle once the open cells can't save it", () => {
    // Black corner: 2 marked, 2 open -> shaded can reach 2, not more than 2.
    const states = [[2, 0, 0], [2, 0, 0], [0, 0, 0]];
    expect(brokenClues(canon, states).circles.has(0)).toBe(true);
    const ok = [[2, 0, 0], [0, 0, 0], [0, 0, 0]];
    expect(brokenClues(canon, ok).circles.has(0)).toBe(false);
  });
});

describe("zebraRopeFormatProblems", () => {
  it("accepts the canon", () => {
    expect(zebraRopeFormatProblems(canon)).toEqual([]);
  });
  it("lists jumps, repeats and misplaced circles", () => {
    const bad: ZebraRopeCanon = {
      width: 3,
      height: 3,
      ropes: [[[0, 0], [2, 0]], [[0, 0], [1, 1], [0, 0]]],
      circles: [{ dr: 1, dc: 1, color: 0 }, { dr: 6, dc: 2, color: 0 }],
    };
    expect(zebraRopeFormatProblems(bad)).toHaveLength(4);
  });
});

describe("sample puzzles", () => {
  // docs/zebra-rope: the parsed canons and their unique solutions (found by a CP-SAT
  // solve of the doc's rules).
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const dir = path.resolve(__dirname, "../../../../docs/zebra-rope");
  for (const i of [1, 2]) {
    it(`accepts sample ${i}'s solution and rejects it with one cell flipped`, () => {
      const sample = JSON.parse(fs.readFileSync(`${dir}/board-zebra-rope-${i}.canon.json`, "utf8"));
      const solution: number[][] = JSON.parse(fs.readFileSync(`${dir}/board-zebra-rope-${i}.solution.json`, "utf8"));
      expect(validateZebraRope(sample, solution)).toBe(true);
      const { circles, ropes } = brokenClues(sample, solution);
      expect(circles.size + ropes.size).toBe(0);
      let rejected = 0;
      for (let r = 0; r < sample.height; r++) {
        for (let c = 0; c < sample.width; c++) {
          const flipped = solution.map((row) => [...row]);
          flipped[r][c] = 1 - flipped[r][c];
          if (!validateZebraRope(sample, flipped)) rejected++;
        }
      }
      // The solution is unique, so every single flip breaks some clue.
      expect(rejected).toBe(sample.width * sample.height);
    });
  }
});
