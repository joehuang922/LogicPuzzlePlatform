import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { OminoTreeCanon } from "../types/canon";
import {
  arrowEdgeKey,
  computeBlocks,
  grows,
  liveErrors,
  ominoTreeFormatProblems,
  ominoTreeProgress,
  validateOminoTree,
  valuesFromWalls,
  wallsFromValues,
} from "./ominoTreeRules";

// The worked example from the rules page and its printed answer.
const example: OminoTreeCanon = {
  rows: 4,
  cols: 4,
  numbers: [
    [1, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 3],
  ],
  arrows: [
    { r: 0, c: 0, dir: "right" },
    { r: 1, c: 1, dir: "left" },
    { r: 2, c: 2, dir: "right" },
    { r: 2, c: 3, dir: "up" },
    { r: 3, c: 1, dir: "up" },
  ],
};
const answer = {
  h: [
    [1, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 1, 0],
  ],
  v: [
    [1, 1, 0],
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 0],
  ],
};
const empty = { h: answer.h.map((r) => r.map(() => 0)), v: answer.v.map((r) => r.map(() => 0)) };

describe("grows", () => {
  it("adds one cell keeping orientation", () => {
    expect(grows([[0, 0], [0, 1]], [[5, 5], [5, 6], [6, 6]])).toBe(true);
    expect(grows([[0, 0]], [[3, 3], [4, 3]])).toBe(true);
  });
  it("rejects rotations, reflections and wrong sizes", () => {
    // vertical domino does not grow into a horizontal I3
    expect(grows([[0, 0], [1, 0]], [[0, 0], [0, 1], [0, 2]])).toBe(false);
    // L tromino ┘ into a square + 1 needs the same L inside
    expect(grows([[0, 1], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 0]])).toBe(false);
    expect(grows([[0, 0]], [[0, 0], [0, 1], [0, 2]])).toBe(false);
  });
});

describe("validateOminoTree", () => {
  it("accepts the printed answer", () => {
    expect(validateOminoTree(example, answer)).toBe(true);
    expect(ominoTreeProgress(example, answer)).toBe(100);
  });
  it("rejects a dangling wall", () => {
    const h = answer.h.map((r) => [...r]);
    h[0][2] = 1; // between (0,2) and (1,2), inside the 2x2 block
    expect(validateOminoTree(example, { h, v: answer.v })).toBe(false);
  });
  it("rejects the undivided board", () => {
    expect(validateOminoTree(example, empty)).toBe(false);
    expect(ominoTreeProgress(example, empty)).toBe(0);
  });
  it("counts valid blocks only", () => {
    // remove the wall between (1,3) and (2,3): 2x2 + L merge into one block of 7
    const h = answer.h.map((r) => [...r]);
    h[1][3] = 0;
    const p = ominoTreeProgress(example, { h, v: answer.v });
    // invalid now: the 7-block, and the blocks whose arrows touch it (E via (2,2)->(2,3))
    // valid: {(0,0)} 1, {(0,1),(1,1)} 2, column 0 tail 3, {(3,1)} 1 => 7 of 16
    expect(p).toBeCloseTo((7 / 16) * 100);
  });
});

describe("liveErrors", () => {
  it("flags a number bigger than its block", () => {
    const h = empty.h.map((r) => [...r]);
    const v = empty.v.map((r) => [...r]);
    // close (3,3) alone: its 3 is too big
    h[2][3] = 1;
    v[3][2] = 1;
    const errs = liveErrors(example, { h, v });
    expect([...errs.numbers]).toEqual(["3,3"]);
    expect(errs.arrows.size).toBe(0);
  });
  it("flags an arrow between complete blocks that don't grow", () => {
    const canon: OminoTreeCanon = {
      rows: 2,
      cols: 3,
      numbers: [
        [1, 3, 0],
        [0, 0, 0],
      ],
      arrows: [{ r: 0, c: 0, dir: "right" }],
    };
    // {(0,0)} (1) -> {(0,1),(0,2),(1,2)} (3): both complete, but 3 != 1 + 1
    const walls = { h: [[1, 1, 0]], v: [[1, 0], [0, 1]] };
    const blocks = computeBlocks(2, 3, walls);
    expect(blocks.cells.length).toBe(3);
    const errs = liveErrors(canon, walls);
    expect([...errs.arrows]).toEqual([0]);
    expect(errs.numbers.size).toBe(0);
  });
  it("flags nothing on the undivided board", () => {
    const errs = liveErrors(example, empty);
    expect(errs.numbers.size + errs.arrows.size).toBe(0);
  });
});

describe("helpers", () => {
  it("round-trips wall values", () => {
    const values = valuesFromWalls(answer);
    expect(wallsFromValues(4, 4, values)).toEqual(answer);
  });
  it("keys arrow edges", () => {
    expect(arrowEdgeKey({ r: 2, c: 3, dir: "up" })).toBe("h:1,3");
    expect(arrowEdgeKey({ r: 1, c: 1, dir: "left" })).toBe("v:1,0");
  });
  it("lists format problems", () => {
    expect(ominoTreeFormatProblems(example)).toEqual([]);
    const bad: OminoTreeCanon = {
      ...example,
      arrows: [
        { r: 0, c: 0, dir: "up" },
        { r: 0, c: 0, dir: "right" },
        { r: 0, c: 1, dir: "left" },
      ],
    };
    expect(ominoTreeFormatProblems(bad)).toHaveLength(2);
  });
});

// The hand-checked samples and their unique solutions (found by an exhaustive search).

describe("docs/omino-tree samples", () => {
  const dir = join(__dirname, "../../../../docs/omino-tree");
  const names = readdirSync(dir)
    .filter((f) => f.endsWith(".solution.json"))
    .map((f) => f.replace(".solution.json", ""));
  it("has the five samples", () => expect(names.length).toBe(5));
  for (const name of names) {
    it(`${name}: the solution solves the canon`, () => {
      const canon = JSON.parse(readFileSync(join(dir, `${name}.canon.json`), "utf8")) as OminoTreeCanon;
      const { grids } = JSON.parse(readFileSync(join(dir, `${name}.solution.json`), "utf8"));
      expect(ominoTreeFormatProblems(canon)).toEqual([]);
      expect(validateOminoTree(canon, grids)).toBe(true);
      expect(liveErrors(canon, grids).arrows.size).toBe(0);
    });
  }
});
