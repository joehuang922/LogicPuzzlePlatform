import { describe, expect, it } from "vitest";
import { createEmptyIrregularNonogram, setBoardCell, setPieceClue } from "./IrregularNonogramEditor";
import { irregularNonogramFormatProblems } from "./irregularNonogramRules";

describe("setBoardCell", () => {
  it("grows the box when a cell is added outside it, shifting clues", () => {
    const c = setPieceClue(createEmptyIrregularNonogram(2, 2), "row", 0, 0, [2], "start");
    const grown = setBoardCell(c, -1, 0, true);
    expect(grown.height).toBe(3);
    expect(grown.cells[0]).toEqual([1, 0]);
    expect(grown.rowClues).toEqual([{ row: 1, start: 0, side: "start", clues: [2] }]);
  });

  it("trims empty outer rows and columns", () => {
    const c = setBoardCell(setBoardCell(createEmptyIrregularNonogram(2, 2), 0, 0, false), 1, 0, false);
    expect(c.width).toBe(1);
    expect(c.cells).toEqual([[1], [1]]);
  });

  it("keeps a clue with its piece when the piece grows at its start", () => {
    // Row 0 of a 1x3 board holds cells 1..2 only; the clue names start 1.
    let c = setBoardCell(createEmptyIrregularNonogram(1, 3), 0, 0, false);
    c = setPieceClue(c, "row", 0, 1, [1], "end");
    expect(c.rowClues[0].start).toBe(0);
    const grown = setBoardCell(c, 0, -1, true);
    expect(grown.rowClues).toEqual([{ row: 0, start: 0, side: "end", clues: [1] }]);
    expect(irregularNonogramFormatProblems(grown).filter((p) => p.message.includes("doesn't start"))).toEqual([]);
  });

  it("leaves a clue whose first cell was removed, for the problems list", () => {
    let c = setPieceClue(createEmptyIrregularNonogram(2, 3), "row", 0, 0, [1], "start");
    c = setBoardCell(c, 0, 0, false);
    expect(c.rowClues).toEqual([{ row: 0, start: 0, side: "start", clues: [1] }]);
    expect(irregularNonogramFormatProblems(c).some((p) => p.message.includes("doesn't start a row piece"))).toBe(true);
  });
});

describe("setPieceClue", () => {
  it("sets, flips and clears a piece's clue", () => {
    let c = createEmptyIrregularNonogram(3, 3);
    c = setPieceClue(c, "col", 2, 1, [1, 1], "start");
    expect(c.colClues).toEqual([{ col: 1, start: 0, side: "start", clues: [1, 1] }]);
    c = setPieceClue(c, "col", 0, 1, [1, 1], "end");
    expect(c.colClues[0].side).toBe("end");
    c = setPieceClue(c, "col", 0, 1, [], "end");
    expect(c.colClues).toEqual([]);
  });
});
