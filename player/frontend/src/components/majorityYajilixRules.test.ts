import { describe, it, expect } from "vitest";
import { MajorityYajilixCanon } from "../types/canon";
import example from "../../../../docs/majority-yajilix/board-majority-yajilix-example.canon.json";
import exampleSolution from "../../../../docs/majority-yajilix/board-majority-yajilix-example.solution.json";
import p1 from "../../../../docs/majority-yajilix/board-majority-yajilix-1.canon.json";
import p1Solution from "../../../../docs/majority-yajilix/board-majority-yajilix-1.solution.json";
import p2 from "../../../../docs/majority-yajilix/board-majority-yajilix-2.canon.json";
import p2Solution from "../../../../docs/majority-yajilix/board-majority-yajilix-2.solution.json";
import p3 from "../../../../docs/majority-yajilix/board-majority-yajilix-3.canon.json";
import p3Solution from "../../../../docs/majority-yajilix/board-majority-yajilix-3.solution.json";
import {
  CROSS,
  Loop,
  brokenClues,
  clueBroken,
  clueHolds,
  emptyLoop,
  majorityYajilixFormatProblems,
  majorityYajilixProgress,
  majorityYajilixWarnings,
  validateMajorityYajilix,
} from "./majorityYajilixRules";

const canon = example as MajorityYajilixCanon;
const solution = (): Loop => JSON.parse(JSON.stringify(exampleSolution.edges));
const noMarks = () => canon.cells.map((row) => row.map(() => 0));

describe("majority yajilix rules", () => {
  it("accepts every sample's solution", () => {
    const samples: [unknown, { edges: Loop }][] = [
      [example, exampleSolution],
      [p1, p1Solution],
      [p2, p2Solution],
      [p3, p3Solution],
    ];
    for (const [c, s] of samples) expect(validateMajorityYajilix(c as MajorityYajilixCanon, s.edges)).toBe(true);
  });

  it("needs the clue's class strictly on top", () => {
    // X→ at R2C2 sees R2C3 (off), R2C4 (straight), R2C5 (off): X 2, I 1.
    expect(clueHolds(canon, solution(), 1, 1)).toBe(true);
    // A 2x2 ring over R1C3-R2C4 makes R2C3 and R2C4 turns and leaves R2C5 off: L 2, X 1.
    const ring = emptyLoop(5, 5);
    ring.h[0][2] = 1;
    ring.h[1][2] = 1;
    ring.v[0][2] = 1;
    ring.v[0][3] = 1;
    expect(clueHolds(canon, ring, 1, 1)).toBe(false);
    expect(validateMajorityYajilix(canon, ring)).toBe(false);
    // L↑ at R5C1 on the empty board sees four X cells.
    expect(clueHolds(canon, emptyLoop(5, 5), 4, 0)).toBe(false);
    const open = solution();
    open.h[0][0] = 0;
    expect(validateMajorityYajilix(canon, open)).toBe(false);
  });

  it("flags a clue that can no longer come out on top", () => {
    expect(brokenClues(canon, emptyLoop(5, 5), noMarks()).clues.size).toBe(0);
    expect(brokenClues(canon, solution(), noMarks()).clues.size).toBe(0);
    // L↓ at R3C5 sees R4C5 and R5C5. One × leaves L at most 1, only tying X's 1.
    const marks = noMarks();
    expect(clueBroken(canon, emptyLoop(5, 5), marks, 2, 4)).toBe(false);
    marks[3][4] = CROSS;
    expect(clueBroken(canon, emptyLoop(5, 5), marks, 2, 4)).toBe(true);
    // A ring through the clue cell R2C2.
    const through = emptyLoop(5, 5);
    through.h[1][0] = 1;
    through.h[2][0] = 1;
    through.v[1][0] = 1;
    through.v[1][1] = 1;
    expect(brokenClues(canon, through, noMarks()).cells.has("1,1")).toBe(true);
  });

  it("computes progress and lists problems", () => {
    expect(majorityYajilixProgress(canon, emptyLoop(5, 5), noMarks())).toBe(0);
    expect(majorityYajilixFormatProblems(canon)).toEqual([]);
    expect(majorityYajilixWarnings(canon)).toEqual([]);
    const empty = { cells: [[null, null], [null, null]] } as MajorityYajilixCanon;
    expect(majorityYajilixWarnings(empty).map((w) => w.message)).toEqual(["No clues"]);
    const offBoard = { cells: [[{ kind: "L", dir: "up" }, null], [null, null]] } as MajorityYajilixCanon;
    expect(majorityYajilixWarnings(offBoard).map((w) => w.message)).toEqual(["L↑ at R1C1 has no cells in its direction"]);
  });
});
