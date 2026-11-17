import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  badSegments,
  clueBroken,
  clueHolds,
  crosses,
  normalize,
  overGray,
  parseSegmentKey,
  segmentKey,
  Segment,
  validateWhimsicalKnight,
  whimsicalKnightFormatProblems,
  whimsicalKnightProgress,
} from "./whimsicalKnightRules";
import { WhimsicalKnightCanon } from "../types/canon";

// docs/whimsical-knight: the rules page's worked example and its unique solution (a
// CP-SAT solve of the doc's rules, matching the printed answer).
const dir = path.resolve(__dirname, "../../../../docs/whimsical-knight");
const example: WhimsicalKnightCanon = JSON.parse(fs.readFileSync(`${dir}/rules-example.canon.json`, "utf8"));
const solution: Segment[] = JSON.parse(fs.readFileSync(`${dir}/rules-example.solution.json`, "utf8")).segments;

describe("segment keys", () => {
  it("round-trip with the smaller dot first", () => {
    expect(segmentKey([2, 1], [1, 3])).toBe("s:1,3,2,1");
    expect(parseSegmentKey("s:1,3,2,1")).toEqual([[1, 3], [2, 1]]);
    expect(parseSegmentKey("h:1,2")).toBeNull();
  });
});

describe("crosses", () => {
  it("catches a knight segment over the step it straddles", () => {
    expect(crosses([[0, 0], [1, 2]], [[0, 1], [1, 1]])).toBe(true);
  });
  it("catches two knight segments crossing", () => {
    expect(crosses([[0, 0], [1, 2]], normalize([0, 2], [1, 0]))).toBe(true);
  });
  it("lets segments share an end dot", () => {
    expect(crosses([[0, 0], [1, 2]], [[1, 2], [1, 3]])).toBe(false);
  });
  it("lets parallel neighbours pass", () => {
    expect(crosses([[0, 0], [1, 2]], [[1, 0], [2, 2]])).toBe(false);
  });
});

describe("overGray", () => {
  it("blocks a knight segment over either cell of its rectangle", () => {
    // Example cell (0,0) is gray: (0,0)-(1,2) covers cells (0,0),(0,1).
    expect(overGray(example, [[0, 0], [1, 2]])).toBe(true);
    // (1,1)-(2,3) covers cells (1,1),(1,2), both empty.
    expect(overGray(example, [[1, 1], [2, 3]])).toBe(false);
    // Orthogonal steps are never blocked.
    expect(overGray(example, [[0, 0], [0, 1]])).toBe(false);
  });
});

describe("clues", () => {
  it("circle on a dot goes straight, square turns square", () => {
    const straight: Segment[] = [[[1, 0], [1, 1]], [[1, 1], [1, 2]]];
    expect(clueHolds("circle", { dr: 2, dc: 2 }, straight)).toBe(true);
    expect(clueHolds("square", { dr: 2, dc: 2 }, straight)).toBe(false);
    // Knight directions (1,2) and (2,-1) are perpendicular.
    const knightTurn: Segment[] = [[[1, 1], [2, 3]], [[1, 1], [3, 0]]];
    expect(clueHolds("square", { dr: 2, dc: 2 }, knightTurn)).toBe(true);
    expect(clueBroken("circle", { dr: 2, dc: 2 }, knightTurn)).toBe(true);
  });
  it("midpoint circle takes the step or a knight segment through it", () => {
    expect(clueHolds("circle", { dr: 1, dc: 2 }, [[[0, 1], [1, 1]]])).toBe(true);
    expect(clueHolds("circle", { dr: 1, dc: 2 }, [[[0, 0], [1, 2]]])).toBe(true);
    expect(clueHolds("circle", { dr: 1, dc: 2 }, [[[0, 0], [0, 1]]])).toBe(false);
  });
});

describe("validateWhimsicalKnight", () => {
  it("accepts the worked example's answer", () => {
    expect(validateWhimsicalKnight(example, solution)).toBe(true);
    expect(badSegments(example, solution).size).toBe(0);
    expect(whimsicalKnightProgress(example, solution)).toBe(100);
  });
  it("rejects it with any one segment removed", () => {
    for (let i = 0; i < solution.length; i++) {
      expect(validateWhimsicalKnight(example, solution.filter((_, j) => j !== i))).toBe(false);
    }
  });
  it("rejects two separate loops", () => {
    const square = (r: number, c: number): Segment[] => [
      [[r, c], [r, c + 1]], [[r, c], [r + 1, c]], [[r, c + 1], [r + 1, c + 1]], [[r + 1, c], [r + 1, c + 1]],
    ];
    const bare = { ...example, circles: [], squares: [] };
    expect(validateWhimsicalKnight(bare, square(0, 0))).toBe(true);
    expect(validateWhimsicalKnight(bare, [...square(0, 0), ...square(3, 3)])).toBe(false);
  });
});

describe("whimsicalKnightFormatProblems", () => {
  it("accepts the example", () => {
    expect(whimsicalKnightFormatProblems(example)).toEqual([]);
  });
  it("lists misplaced and duplicate clues and a bad gray grid", () => {
    const bad: WhimsicalKnightCanon = {
      ...example,
      gray: [[0]],
      circles: [{ dr: 1, dc: 1 }, { dr: 0, dc: 0 }],
      squares: [{ dr: 1, dc: 0 }],
    };
    // Gray size, circle in a cell, square off a dot.
    expect(whimsicalKnightFormatProblems(bad)).toHaveLength(3);
  });
});
