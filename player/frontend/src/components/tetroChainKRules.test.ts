import { describe, it, expect } from "vitest";
import { TetroChainKCanon } from "../types/canon";
import example from "../../../../docs/tetro-chain-k/board-tetro-chain-k-example.canon.json";
import exampleSolution from "../../../../docs/tetro-chain-k/board-tetro-chain-k-example.solution.json";
import p1 from "../../../../docs/tetro-chain-k/board-tetro-chain-k-1.canon.json";
import p1Solution from "../../../../docs/tetro-chain-k/board-tetro-chain-k-1.solution.json";
import p2 from "../../../../docs/tetro-chain-k/board-tetro-chain-k-2.canon.json";
import p2Solution from "../../../../docs/tetro-chain-k/board-tetro-chain-k-2.solution.json";
import p3 from "../../../../docs/tetro-chain-k/board-tetro-chain-k-3.canon.json";
import p3Solution from "../../../../docs/tetro-chain-k/board-tetro-chain-k-3.solution.json";
import p4 from "../../../../docs/tetro-chain-k/board-tetro-chain-k-4.canon.json";
import p4Solution from "../../../../docs/tetro-chain-k/board-tetro-chain-k-4.solution.json";
import {
  DOT,
  SHADED,
  brokenClues,
  chained,
  emptyStates,
  fromValues,
  groups,
  shapeOf,
  tetroChainKFormatProblems,
  tetroChainKProgress,
  tetroChainKWarnings,
  toValues,
  twinTouches,
  validateTetroChainK,
} from "./tetroChainKRules";

const canon = example as TetroChainKCanon;
const solved = () => exampleSolution.cells.map((row) => [...row]);

describe("tetro chain k rules", () => {
  it("accepts every sample's solution", () => {
    const samples: [unknown, { cells: number[][] }][] = [
      [example, exampleSolution],
      [p1, p1Solution],
      [p2, p2Solution],
      [p3, p3Solution],
      [p4, p4Solution],
    ];
    for (const [c, s] of samples) expect(validateTetroChainK(c as TetroChainKCanon, s.cells)).toBe(true);
  });

  it("names the five tetrominoes in any orientation", () => {
    expect(shapeOf([[0, 0], [0, 1], [0, 2], [0, 3]])).toBe("I");
    expect(shapeOf([[0, 0], [1, 0], [2, 0], [3, 0]])).toBe("I");
    expect(shapeOf([[0, 0], [0, 1], [1, 0], [1, 1]])).toBe("O");
    expect(shapeOf([[0, 1], [1, 0], [1, 1], [1, 2]])).toBe("T");
    expect(shapeOf([[0, 0], [1, 0], [2, 0], [2, 1]])).toBe("L");
    expect(shapeOf([[0, 0], [0, 1], [0, 2], [1, 0]])).toBe("L");
    expect(shapeOf([[0, 1], [0, 2], [1, 0], [1, 1]])).toBe("S");
    expect(shapeOf([[0, 0], [1, 0], [1, 1], [2, 1]])).toBe("S");
    expect(shapeOf([[0, 0], [0, 1], [0, 2]])).toBeNull();
  });

  it("finds the example's three tetrominoes, chained, no twins touching", () => {
    const gs = groups(canon, solved());
    expect(gs.map((g) => shapeOf(g)).sort()).toEqual(["L", "S", "T"]);
    expect(chained(canon, solved())).toBe(true);
    expect(twinTouches(gs)).toEqual([]);
  });

  it("rejects a wrong circle, a big group, a broken chain and touching twins", () => {
    expect(validateTetroChainK(canon, emptyStates(canon))).toBe(false);
    // The other T-shaped finish (bottom-right T next to the top T): circles hold, twins touch.
    const twin = solved();
    twin[4][3] = 0;
    twin[4][4] = SHADED;
    expect(twinTouches(groups(canon, twin)).length).toBe(1);
    expect(validateTetroChainK(canon, twin)).toBe(false);
    const big = solved();
    big[4][2] = SHADED; // joins the L to the S: one group of 8
    expect(validateTetroChainK(canon, big)).toBe(false);
    // Two separate pieces far apart: not chained.
    const apart = { width: 6, height: 1, circles: [] } as TetroChainKCanon;
    const row = [[1, 0, 0, 0, 0, 1]];
    expect(chained(apart, row)).toBe(false);
  });

  it("flags circles and groups the decided cells already break", () => {
    expect(brokenClues(canon, emptyStates(canon)).circles.size).toBe(0);
    const ok = brokenClues(canon, solved());
    expect(ok.circles.size + ok.cells.size).toBe(0);
    // Black circle (0) at corner R1-2 C2-3: three dots there leave at most one shaded.
    const s = emptyStates(canon);
    s[0][1] = DOT;
    s[0][2] = DOT;
    s[1][1] = DOT;
    expect(brokenClues(canon, s).circles.has(0)).toBe(true);
    // A single shaded corner cell boxed in by dots can't grow to 4.
    const stuck = emptyStates(canon);
    stuck[0][0] = SHADED;
    stuck[0][1] = DOT;
    stuck[1][0] = DOT;
    expect(brokenClues(canon, stuck).cells.has("0,0")).toBe(true);
  });

  it("round-trips values and computes progress", () => {
    const states = solved().map((row) => row.map((v) => (v === 1 ? SHADED : DOT)));
    expect(fromValues(canon, toValues(states))).toEqual(states);
    expect(tetroChainKProgress(canon, emptyStates(canon))).toBe(0);
    expect(tetroChainKProgress(canon, states)).toBe(100);
  });

  it("lists format problems and warnings", () => {
    expect(tetroChainKFormatProblems(canon)).toEqual([]);
    expect(tetroChainKWarnings(canon)).toEqual([]);
    const bad = { ...canon, circles: [...canon.circles, { dr: 1, dc: 1, color: 0 }, { dr: 2, dc: 4, color: 2 }] } as TetroChainKCanon;
    expect(tetroChainKFormatProblems(bad).map((p) => p.message)).toEqual([
      "Circle at (1,1) is at a cell centre",
      "Two circles at (2,4)",
    ]);
    expect(tetroChainKWarnings({ ...canon, circles: [] }).map((w) => w.message)).toEqual(["No circles"]);
  });
});
