import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gate } from "../../gate";
import { IrregularNonogramCanon } from "./model";

// The doc's 3x4 example (docs/irregular-nonogram).
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

describe("irregular nonogram gate", () => {
  it("solves the doc example uniquely", () => {
    expect(gate(45, canon)).toEqual({
      verdict: "unique",
      solution: { cells: [[0, 1, 0, 0], [0, 0, 0, 1], [1, 1, 1, 1]] },
    });
  });

  it("keeps a row's pieces apart", () => {
    // One row split by a gap: [1] on the left piece, [2] on the right one.
    const split: IrregularNonogramCanon = {
      width: 5,
      height: 1,
      cells: [[1, 1, 0, 1, 1]],
      rowClues: [
        { row: 0, start: 0, side: "start", clues: [1] },
        { row: 0, start: 3, side: "end", clues: [2] },
      ],
      colClues: [
        { col: 0, start: 0, side: "start", clues: [1] },
        { col: 3, start: 0, side: "start", clues: [1] },
        { col: 4, start: 0, side: "start", clues: [1] },
      ],
    };
    expect(gate(45, split)).toEqual({ verdict: "unique", solution: { cells: [[1, 0, 0, 1, 1]] } });
  });

  it("reports several solutions and none", () => {
    const loose = { ...canon, colClues: canon.colClues.slice(0, 2) };
    expect(gate(45, loose)?.verdict).toBe("multiple");
    const bad = { ...canon, rowClues: canon.rowClues.map((e, i) => (i === 2 ? { ...e, clues: [2] } : e)) };
    expect(gate(45, bad)?.verdict).toBe("none");
  });
});

describe("irregular nonogram gate on the docs samples", () => {
  // The parser's canons for the two scans (docs/irregular-nonogram): unique puzzles.
  const docs = resolve(__dirname, "../../../../../docs/irregular-nonogram");
  for (const n of [1, 2]) {
    it(`board-irregular-nonogram-${n} has exactly one solution`, () => {
      const sample = JSON.parse(readFileSync(resolve(docs, `board-irregular-nonogram-${n}.canon.json`), "utf8"));
      const result = gate(45, sample, { deadline: Date.now() + 60_000 });
      expect(result?.verdict).toBe("unique");
    });
  }
});
