import { describe, it, expect } from "vitest";
import { YajilixCanon } from "../types/canon";
import example from "../../../../docs/yajilix/board-yajilix-example.canon.json";
import exampleSolution from "../../../../docs/yajilix/board-yajilix-example.solution.json";
import p1 from "../../../../docs/yajilix/board-yajilix-1.canon.json";
import p1Solution from "../../../../docs/yajilix/board-yajilix-1.solution.json";
import p2 from "../../../../docs/yajilix/board-yajilix-2.canon.json";
import p2Solution from "../../../../docs/yajilix/board-yajilix-2.solution.json";
import p3 from "../../../../docs/yajilix/board-yajilix-3.canon.json";
import p3Solution from "../../../../docs/yajilix/board-yajilix-3.solution.json";
import {
  CROSS,
  DOT,
  Loop,
  brokenClues,
  clueBroken,
  clueCount,
  emptyLoop,
  fromValues,
  lineCells,
  toValues,
  validateYajilix,
  yajilixFormatProblems,
  yajilixProgress,
  yajilixWarnings,
} from "./yajilixRules";

const canon = example as YajilixCanon;
const solution = (): Loop => JSON.parse(JSON.stringify(exampleSolution.edges));
const noMarks = () => canon.cells.map((row) => row.map(() => 0));

describe("yajilix rules", () => {
  it("accepts every sample's solution", () => {
    const samples: [unknown, { edges: Loop }][] = [
      [example, exampleSolution],
      [p1, p1Solution],
      [p2, p2Solution],
      [p3, p3Solution],
    ];
    for (const [c, s] of samples) expect(validateYajilix(c as YajilixCanon, s.edges)).toBe(true);
  });

  it("counts turns, straights and skipped cells, skipping clue cells", () => {
    // L2↑ at R3C1 sees R2C1 (turn) and R1C1 (turn).
    expect(clueCount(canon, solution(), 2, 0)).toBe(2);
    // X1← at R5C6 sees R5C5..R5C1 minus the L2← clue at R5C4.
    expect(lineCells(canon, 4, 5, "left").map(([, c]) => c)).toEqual([4, 2, 1, 0]);
    expect(clueCount(canon, solution(), 4, 5)).toBe(1);
    // I1→ at R3C5 sees R3C6, a straight.
    expect(clueCount(canon, solution(), 2, 4)).toBe(1);
  });

  it("rejects a missing segment, a loop through a clue and a wrong count", () => {
    const open = solution();
    open.h[0][0] = 0;
    expect(validateYajilix(canon, open)).toBe(false);
    expect(validateYajilix(canon, emptyLoop(6, 6))).toBe(false);

    // A 2x2 ring in the bottom-left corner is a loop but breaks clues.
    const small = emptyLoop(6, 6);
    small.h[4][0] = 1;
    small.h[5][0] = 1;
    small.v[4][0] = 1;
    small.v[4][1] = 1;
    expect(validateYajilix(canon, small)).toBe(false);

    // A ring through the X1← clue at R1C5.
    const through = emptyLoop(6, 6);
    through.h[0][3] = 1;
    through.h[1][3] = 1;
    through.v[0][3] = 1;
    through.v[0][4] = 1;
    expect(brokenClues(canon, through, noMarks()).cells.has("0,4")).toBe(true);
    expect(validateYajilix(canon, through)).toBe(false);
  });

  it("flags clues the committed cells already break", () => {
    const marks = noMarks();
    expect(brokenClues(canon, emptyLoop(6, 6), marks).clues.size).toBe(0);
    // X1← at R1C5: two crosses to its left are one too many.
    marks[0][0] = CROSS;
    marks[0][1] = CROSS;
    expect(clueBroken(canon, emptyLoop(6, 6), marks, 0, 4)).toBe(true);
    // L2↑ at R3C1: crossing both cells above leaves no room for two turns.
    const m2 = noMarks();
    m2[0][0] = CROSS;
    expect(clueBroken(canon, emptyLoop(6, 6), m2, 2, 0)).toBe(true);
    m2[0][0] = DOT;
    expect(clueBroken(canon, emptyLoop(6, 6), m2, 2, 0)).toBe(false);
    // I1→ at R3C5 sees only R3C6: crossing it leaves no straight.
    const m3 = noMarks();
    m3[2][5] = CROSS;
    expect(clueBroken(canon, emptyLoop(6, 6), m3, 2, 4)).toBe(true);
    // L2↑ at R3C1: R2C1 going straight up and down leaves one possible turn.
    const straight = emptyLoop(6, 6);
    straight.v[0][0] = 1;
    straight.v[1][0] = 1;
    expect(clueBroken(canon, straight, noMarks(), 2, 0)).toBe(true);
    // The finished answer breaks nothing.
    expect(brokenClues(canon, solution(), noMarks()).clues.size).toBe(0);
  });

  it("round-trips player values and computes progress over empty cells", () => {
    const marks = noMarks();
    marks[5][5] = CROSS;
    marks[1][0] = DOT;
    const values = toValues(solution(), marks);
    const back = fromValues(6, 6, values);
    expect(back.loop).toEqual(solution());
    expect(back.marks).toEqual(marks);
    expect(yajilixProgress(canon, emptyLoop(6, 6), noMarks())).toBe(0);
    // 30 empty cells: the loop touches 24 and R6C6 carries a × (R2C1's • is on the loop).
    expect(yajilixProgress(canon, solution(), marks)).toBeCloseTo((25 / 30) * 100);
  });

  it("lists format problems and misread warnings", () => {
    expect(yajilixFormatProblems(canon)).toEqual([]);
    expect(yajilixWarnings(canon)).toEqual([]);
    const ragged = { cells: [[null, null], [null]] } as YajilixCanon;
    expect(yajilixFormatProblems(ragged)).toHaveLength(1);
    const empty = { cells: [[null, null], [null, null]] } as YajilixCanon;
    expect(yajilixWarnings(empty).map((w) => w.message)).toEqual(["No clues"]);
    const offBoard = { cells: [[{ kind: "L", num: 1, dir: "up" }, null]] } as YajilixCanon;
    expect(yajilixWarnings(offBoard)).toHaveLength(1);
  });
});
