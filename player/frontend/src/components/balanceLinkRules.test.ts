import { describe, expect, it } from "vitest";
import { finishedSymbols, isBalanced, traceLines, validateBalanceLink } from "./balanceLinkRules";

// The rule sheet's 4x4 example and its answer.
const cells = [
  [0, 0, 0, 60],
  [11, 1, 11, 0],
  [0, 60, 0, 0],
  [41, 0, 0, 41],
];
const answer = {
  h: [
    [1, 1, 0],
    [0, 0, 0],
    [0, 1, 1],
    [1, 1, 1],
  ],
  v: [
    [1, 0, 1, 1],
    [0, 0, 0, 1],
    [0, 0, 0, 0],
  ],
};
const copy = () => ({ h: answer.h.map((r) => [...r]), v: answer.v.map((r) => [...r]) });

describe("isBalanced", () => {
  it("accepts mirror-symmetric lines", () => {
    expect(isBalanced([[0, 0], [0, 1], [0, 2]])).toBe(true); // straight
    expect(isBalanced([[1, 0], [0, 0], [0, 1], [0, 2], [1, 2]])).toBe(true); // U, vertical mirror
    expect(isBalanced([[0, 3], [1, 3], [2, 3], [2, 2], [2, 1]])).toBe(true); // L, diagonal mirror
    expect(isBalanced([[2, 0], [1, 0], [1, 1], [1, 2], [2, 2]])).toBe(true); // ∩ shape
    expect(isBalanced([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true); // short U, sideways mirror
  });
  it("rejects lines that are only point-symmetric or lopsided", () => {
    expect(isBalanced([[0, 0], [0, 1], [1, 1], [1, 2]])).toBe(false); // S/Z step
    expect(isBalanced([[0, 0], [1, 0], [2, 0], [2, 1]])).toBe(false); // uneven L
    expect(isBalanced([[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]])).toBe(false); // Z
  });
});

describe("validateBalanceLink", () => {
  it("accepts the rule sheet's answer", () => {
    expect(validateBalanceLink(cells, answer)).toBe(true);
    expect(finishedSymbols(cells, answer)).toBe(6);
  });

  it("rejects a missing segment, a segment into a black cell and a stray loop", () => {
    const missing = copy();
    missing.h[3][1] = 0;
    expect(validateBalanceLink(cells, missing)).toBe(false);
    expect(finishedSymbols(cells, missing)).toBe(4);
    const intoBlack = copy();
    intoBlack.h[1][0] = 1; // (1,0) circle -> (1,1) black
    expect(validateBalanceLink(cells, intoBlack)).toBe(false);
    // A closed 2x2 loop away from the symbols.
    const c = [[60, 0, 0, 0], [0, 0, 0, 0], [60, 0, 0, 0]];
    const edges = {
      h: [[0, 1, 0], [0, 1, 0], [0, 0, 0]],
      v: [[1, 1, 1, 0], [1, 0, 0, 0]],
    };
    expect(validateBalanceLink(c, edges)).toBe(false);
  });

  it("flags a matched but unbalanced line", () => {
    const c = [
      [60, 0, 0],
      [0, 0, 0],
      [0, 0, 60],
    ];
    // (0,0) down to (2,0), right to (2,2): an L with equal arms — balanced.
    const l = { h: [[0, 0], [0, 0], [1, 1]], v: [[1, 0, 0], [1, 0, 0]] };
    expect(validateBalanceLink(c, l)).toBe(true);
    // (0,0) right, down 2, right: a Z — matched, not balanced.
    const z = { h: [[1, 0], [0, 0], [0, 1]], v: [[0, 1, 0], [0, 1, 0]] };
    const [line] = traceLines(c, z);
    expect(line.matched && !line.balanced).toBe(true);
    expect(validateBalanceLink(c, z)).toBe(false);
  });

  it("rejects joining different symbols", () => {
    const c = [[60, 0, 61]];
    expect(validateBalanceLink(c, { h: [[1, 1]], v: [] })).toBe(false);
  });
});
