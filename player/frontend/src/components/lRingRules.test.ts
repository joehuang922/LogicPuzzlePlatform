import { describe, it, expect } from "vitest";
import { arrowState, satisfiedArrows, validateLRing, lRingWarnings, Edges } from "./lRingRules";

// The rule sheet's 4x4 example and its answer.
const cells = [
  [3, 0, 4, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 1],
];
const answer: Edges = {
  h: [
    [1, 1, 0],
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  v: [
    [1, 0, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ],
};
const empty = (): Edges => ({
  h: Array.from({ length: 4 }, () => [0, 0, 0]),
  v: Array.from({ length: 3 }, () => [0, 0, 0, 0]),
});

describe("L-Ring rules", () => {
  it("accepts the rule sheet answer", () => {
    expect(validateLRing(cells, answer)).toBe(true);
    expect(satisfiedArrows(cells, answer)).toBe(3);
  });

  it("starts open with nothing drawn", () => {
    const e = empty();
    expect(validateLRing(cells, e)).toBe(false);
    expect(arrowState(cells, e, 0, 0)).toBe("open");
    expect(satisfiedArrows(cells, e)).toBe(0);
  });

  it("flags equal arms as bad", () => {
    // A 3x3 square loop around the corner R1C1: both arms 2.
    const e = empty();
    e.h[0][0] = e.h[0][1] = e.h[2][0] = e.h[2][1] = 1;
    e.v[0][0] = e.v[1][0] = e.v[0][2] = e.v[1][2] = 1;
    expect(arrowState(cells, e, 0, 0)).toBe("bad");
    expect(validateLRing(cells, e)).toBe(false);
  });

  it("flags a straight pass through an arrow as bad", () => {
    const e = empty();
    e.v[0][3] = e.v[1][3] = e.v[2][3] = 1;
    e.h[3][2] = 0;
    // Up arrow at R4C4 entered from above only: still open (one segment).
    expect(arrowState(cells, e, 3, 3)).toBe("open");
    e.h[0][1] = e.h[0][2] = 1; // R1C3 left arrow, left + right = straight
    expect(arrowState(cells, e, 0, 2)).toBe("bad");
  });

  it("stays open while an arm hasn't turned yet", () => {
    const e = empty();
    e.v[0][0] = e.v[1][0] = 1;
    e.h[0][0] = e.h[0][1] = 1;
    expect(arrowState(cells, e, 0, 0)).toBe("open");
  });

  it("rejects two separate loops", () => {
    const c2 = [
      [3, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    // Loop 1: a 3x2 rectangle with the arrow at its corner (down arm 2, right arm 1).
    // Loop 2: a separate 2x2 square at rows 1-2, columns 4-5.
    const e: Edges = {
      h: [
        [1, 0, 0, 1],
        [0, 0, 0, 1],
        [1, 0, 0, 0],
      ],
      v: [
        [1, 1, 0, 1, 1],
        [1, 1, 0, 0, 0],
      ],
    };
    expect(arrowState(c2, e, 0, 0)).toBe("ok");
    expect(validateLRing(c2, e)).toBe(false);
  });

  it("warns on no arrows and arrows pointing off the board", () => {
    expect(lRingWarnings([[0, 0], [0, 0]])).toEqual(["No arrows"]);
    expect(lRingWarnings([[1, 0], [0, 0]])).toEqual(["Row 1, column 1: the up arrow points off the board"]);
    expect(lRingWarnings(cells)).toEqual([]);
  });
});
