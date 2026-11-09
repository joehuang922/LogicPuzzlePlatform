import { describe, expect, it } from "vitest";
import { evolvesFrom, sinkaminoFormatProblems, validateSinkamino } from "./sinkaminoRules";

// The doc's 3x5 example: islands {(0,0)} -> {(0,2),(1,2)} -> {(0,4),(1,4),(2,4)}.
const canon = {
  cells: [
    [2, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 0, 0, 2],
  ],
  arrows: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]],
};
const answer = [
  [0, 0, 1, 0, 1],
  [0, 0, 1, 0, 1],
  [0, 0, 0, 0, 0],
];

describe("evolvesFrom", () => {
  it("accepts the same orientation plus one square", () => {
    expect(evolvesFrom([[0, 0], [1, 0]], [[5, 5], [6, 5], [7, 5]])).toBe(true);
    expect(evolvesFrom([[0, 0], [1, 0]], [[5, 5], [6, 5], [6, 6]])).toBe(true);
  });
  it("rejects a rotated shape", () => {
    // Vertical domino -> horizontal tromino needs a rotation.
    expect(evolvesFrom([[0, 0], [1, 0]], [[0, 0], [0, 1], [0, 2]])).toBe(false);
  });
  it("rejects a mirrored shape", () => {
    // L: (0,0),(1,0),(1,1) -> mirrored L plus one cell.
    expect(evolvesFrom([[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 1], [1, 0], [2, 0]])).toBe(false);
  });
  it("rejects a size jump other than 1", () => {
    expect(evolvesFrom([[0, 0]], [[0, 0], [0, 1], [0, 2]])).toBe(false);
  });
});

describe("validateSinkamino", () => {
  it("accepts the example answer, with marks counting as empty", () => {
    expect(validateSinkamino(canon, answer)).toBe(true);
    const marked = answer.map((row) => row.map((v) => (v === 0 ? 2 : v)));
    expect(validateSinkamino(canon, marked)).toBe(true);
  });

  it("rejects every single-cell change", () => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        if (canon.cells[r][c] !== 0) continue;
        const states = answer.map((row) => [...row]);
        states[r][c] = states[r][c] === 1 ? 0 : 1;
        expect(validateSinkamino(canon, states), `flip R${r + 1}C${c + 1}`).toBe(false);
      }
    }
  });

  it("rejects an island crossed twice", () => {
    // A horizontal domino on the trail is crossed at both cells.
    const c2 = { cells: [[2, 0, 0, 0, 0]], arrows: [[[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]] };
    expect(validateSinkamino(c2, [[0, 0, 1, 1, 0]])).toBe(false);
  });

  it("rejects an island no arrow crosses, and an arrow over one island", () => {
    const c3 = { cells: [[2, 0, 0], [0, 0, 2]], arrows: [[[0, 0], [0, 1]]] };
    expect(validateSinkamino(c3, [[0, 0, 0], [0, 0, 0]])).toBe(false);
  });
});

describe("sinkaminoFormatProblems", () => {
  it("lists broken trails", () => {
    const bad = {
      cells: [[0, 1, 0], [0, 0, 0]],
      arrows: [[[0, 0]], [[0, 0], [0, 1]], [[1, 0], [1, 2]], [[1, 2], [2, 2]]],
    };
    expect(sinkaminoFormatProblems(bad)).toEqual([
      "Arrow 1 is shorter than 2 cells",
      "Arrow 2 crosses the black cell R1C2",
      "Arrow 3 jumps from R2C1 to R2C3",
      "Arrow 4 leaves the grid at R3C3",
    ]);
    expect(sinkaminoFormatProblems(canon)).toEqual([]);
  });
});
