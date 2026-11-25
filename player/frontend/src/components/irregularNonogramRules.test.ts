import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clueLayout,
  clueStatus,
  cluesBySegment,
  irregularNonogramAnswer,
  irregularNonogramValues,
  irregularNonogramFormatProblems,
  irregularNonogramProgress,
  irregularNonogramWarnings,
  isIrregularNonogramSolved,
  layoutBounds,
  lineFits,
  segmentAt,
  segments,
} from "./irregularNonogramRules";
import { IrregularNonogramCanon } from "../types/canon";

// The doc's 3x4 example and its unique solution.
const canon: IrregularNonogramCanon = {
  width: 4,
  height: 3,
  cells: [
    [1, 1, 0, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  rowClues: [
    { row: 0, start: 0, side: "start", clues: [1] },
    { row: 1, start: 0, side: "end", clues: [1] },
    { row: 2, start: 0, side: "start", clues: [4] },
  ],
  colClues: [
    { col: 0, start: 0, side: "start", clues: [1] },
    { col: 1, start: 0, side: "start", clues: [1, 1] },
    { col: 2, start: 1, side: "start", clues: [1] },
    { col: 3, start: 1, side: "start", clues: [2] },
  ],
};
const solution = [
  [0, 1, 0, 0],
  [0, 0, 0, 1],
  [1, 1, 1, 1],
];
const values: Record<string, number> = {};
solution.forEach((row, r) => row.forEach((v, c) => { if (v) values[`${c},${r}`] = 1; }));

const clone = (c: IrregularNonogramCanon): IrregularNonogramCanon => JSON.parse(JSON.stringify(c));

describe("segments", () => {
  it("finds row and column pieces, split by gaps", () => {
    const split: IrregularNonogramCanon = { ...canon, width: 5, height: 1, cells: [[1, 1, 0, 1, 1]], rowClues: [], colClues: [] };
    expect(segments(split).filter((s) => s.axis === "row")).toEqual([
      { axis: "row", line: 0, start: 0, length: 2 },
      { axis: "row", line: 0, start: 3, length: 2 },
    ]);
    expect(segmentAt(canon, "col", 2, 3)).toEqual({ axis: "col", line: 3, start: 1, length: 2 });
    expect(segmentAt(canon, "row", 0, 3)).toBeNull();
  });
});

describe("format problems", () => {
  it("accepts the doc example", () => {
    expect(irregularNonogramFormatProblems(canon)).toEqual([]);
    expect(irregularNonogramWarnings(canon)).toEqual([]);
  });
  it("flags a clue that names no piece, two clues on a piece, and a clue too long", () => {
    const c = clone(canon);
    c.rowClues.push({ row: 1, start: 2, side: "start", clues: [1] });
    c.colClues.push({ col: 0, start: 0, side: "end", clues: [1] });
    c.rowClues[2].clues = [3, 1];
    const messages = irregularNonogramFormatProblems(c).map((p) => p.message);
    expect(messages.some((m) => m.includes("doesn't start a row piece"))).toBe(true);
    expect(messages.some((m) => m.includes("two clues"))).toBe(true);
    expect(messages.some((m) => m.includes("doesn't fit"))).toBe(true);
  });
  it("flags clue blocks that overlap the board or each other", () => {
    const c = clone(canon);
    c.colClues[2].side = "end"; // column 2 below: row 3, outside -> fine
    expect(irregularNonogramFormatProblems(c)).toEqual([]);
    c.rowClues[0].side = "end"; // row 0 right of (0,1): (0,2) free -> fine
    expect(irregularNonogramFormatProblems(c)).toEqual([]);
    c.colClues[2].side = "start"; // column 2 above: (0,2), now taken by row 0's clue
    expect(irregularNonogramFormatProblems(c).map((p) => p.message)[0]).toMatch(/overlaps/);
  });
  it("warns about pieces with no clue", () => {
    const c = clone(canon);
    c.colClues.pop();
    expect(irregularNonogramFormatProblems(c)).toEqual([]);
    expect(irregularNonogramWarnings(c)[0].message).toBe("1 piece has no clue");
  });
});

describe("layout", () => {
  it("places clues toward the board in reading order", () => {
    const ref = cluesBySegment(canon).get("col:1:0")!;
    // [1, 1] above column 1: the first number further from the board.
    expect(clueLayout(ref, 3)).toEqual([[-2, 1, 1], [-1, 1, 1]]);
    const right = cluesBySegment(canon).get("row:1:0")!;
    expect(clueLayout(right, 4)).toEqual([[1, 4, 1]]);
    expect(layoutBounds(canon)).toEqual([-2, -1, 2, 4]);
  });
});

describe("lines", () => {
  it("lineFits respects filled and crossed cells", () => {
    expect(lineFits([0, 0, 0, 0], [2, 1])).toBe(true);
    expect(lineFits([0, 0, 0], [2, 1])).toBe(false);
    expect(lineFits([1, 0, 0, 1], [3])).toBe(false);
    expect(lineFits([0, 2, 0, 0], [2])).toBe(true);
    expect(lineFits([0, 2, 0, 2], [2])).toBe(false);
    expect(lineFits([1, 1, 2, 1], [2, 1])).toBe(true);
    expect(lineFits([2, 2], [])).toBe(true);
    expect(lineFits([1], [])).toBe(false);
  });
});

describe("solving", () => {
  it("is solved by the solution only", () => {
    expect(isIrregularNonogramSolved(canon, values)).toBe(true);
    expect(isIrregularNonogramSolved(canon, { ...values, "0,0": 1 })).toBe(false);
    // Crosses count as empty.
    expect(isIrregularNonogramSolved(canon, { ...values, "0,0": 2 })).toBe(true);
  });
  it("reports satisfied and broken clues", () => {
    const s = clueStatus(canon, values);
    expect(s.satisfied.size).toBe(7);
    expect(s.broken.size).toBe(0);
    const bad = clueStatus(canon, { "0,0": 1, "1,0": 1 });
    expect(bad.broken.has("row:0:0")).toBe(true);
  });
  it("progress and answer", () => {
    expect(irregularNonogramProgress(canon, {})).toBe(0);
    expect(irregularNonogramProgress(canon, { "0,0": 2 })).toBeCloseTo(10);
    // Crosses are kept, so a reload restores them.
    const withCross = irregularNonogramAnswer(canon, { ...values, "0,0": 2 });
    expect(withCross).toEqual({ cells: [[2, 1, 0, 0], [0, 0, 0, 1], [1, 1, 1, 1]] });
    expect(irregularNonogramValues(withCross)).toEqual({ ...values, "0,0": 2 });
  });
});

describe("docs samples", () => {
  const docs = resolve(__dirname, "../../../../docs/irregular-nonogram");
  for (const n of [1, 2]) {
    it(`board-irregular-nonogram-${n} is valid with a clue on every piece`, () => {
      const sample = JSON.parse(readFileSync(resolve(docs, `board-irregular-nonogram-${n}.canon.json`), "utf8")) as IrregularNonogramCanon;
      expect(irregularNonogramFormatProblems(sample)).toEqual([]);
      expect(irregularNonogramWarnings(sample)).toEqual([]);
    });
  }
});

describe("per-number greying", () => {
  it("greys a number once its run is settled from an end, like Nonogram", () => {
    // Column 1 [1, 1]: its first run sealed at the top (filled, then crossed).
    const s = clueStatus(canon, { "1,0": 1, "1,1": 2 });
    expect(s.numbers.get("col:1:0")).toEqual(["satisfied", "normal"]);
    expect(s.satisfied.has("col:1:0")).toBe(false);
  });
});
