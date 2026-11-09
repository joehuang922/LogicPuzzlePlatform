import { describe, expect, it } from "vitest";
import { validateCornerChain } from "./CornerChainBoard";

// The rule sheet's 5x5 example and its published answer (1 = black).
const canon = {
  cells: [
    [3, 0, 0, 4, 4],
    [0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0],
    [0, 0, 0, 0, 5],
    [0, 0, 0, 0, 5],
  ],
};
const answer = [
  [0, 0, 1, 0, 0],
  [1, 0, 1, 0, 0],
  [0, 1, 0, 1, 1],
  [0, 1, 0, 0, 0],
  [1, 1, 1, 1, 0],
];

describe("validateCornerChain", () => {
  it("accepts the published answer", () => {
    expect(validateCornerChain(canon, answer)).toBe(true);
  });

  it("treats marked cells as white", () => {
    const marked = answer.map((row) => row.map((v) => (v === 0 ? 2 : v)));
    expect(validateCornerChain(canon, marked)).toBe(true);
  });

  it("rejects every single-cell change to the answer", () => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (canon.cells[r][c] > 0) continue;
        const states = answer.map((row) => [...row]);
        states[r][c] = states[r][c] === 1 ? 0 : 1;
        expect(validateCornerChain(canon, states), `flip R${r + 1}C${c + 1}`).toBe(false);
      }
    }
  });

  it("rejects an odd island that is a rectangle", () => {
    // A 1x3 bar of white (odd, rectangle) on an otherwise black 3x3 board.
    const c3 = { cells: [[0, 0, 0], [3, 0, 0], [0, 0, 0]] };
    const s = [[1, 1, 1], [0, 0, 0], [1, 1, 1]];
    expect(validateCornerChain(c3, s)).toBe(false);
  });

  it("rejects an even island that is not a rectangle", () => {
    // An L of 4 cells.
    const c3 = { cells: [[4, 0, 0], [0, 0, 0], [0, 0, 0]] };
    const s = [[0, 1, 1], [0, 1, 1], [0, 0, 1]];
    expect(validateCornerChain(c3, s)).toBe(false);
  });

  it("rejects valid islands that are not linked at corners", () => {
    // Two 1x2 islands separated by a full black column: no shared corner.
    const c = { cells: [[2, 0, 0, 2, 0], [0, 0, 0, 0, 0]] };
    const s = [[0, 0, 1, 0, 0], [1, 1, 1, 1, 1]];
    expect(validateCornerChain(c, s)).toBe(false);
    // Joined diagonally they pass: (0,0)-(0,1) and (1,2)-(1,3) touch at a corner.
    const s2 = [[0, 0, 1, 1, 1], [1, 1, 0, 0, 1]];
    const c2 = { cells: [[2, 0, 0, 0, 0], [0, 0, 2, 0, 0]] };
    expect(validateCornerChain(c2, s2)).toBe(true);
  });
});
