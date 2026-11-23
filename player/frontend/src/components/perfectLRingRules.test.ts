import { describe, it, expect } from "vitest";
import { cornerState, satisfiedArrows, validateLRing, Edges } from "./lRingRules";

// Perfect L-Ring (type 42): each board's unique solution (checked with CP-SAT), and
// another loop that solves it as plain L-Ring but breaks the corner rule.
const BOARDS: { name: string; cells: number[][]; answer: Edges; plainOnly: Edges }[] = [
  {
    name: "the rule sheet example",
    cells: [[2, 0, 0, 0, 0], [0, 0, 3, 0, 0], [0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    answer: {"h": [[1, 1, 1, 1], [0, 0, 1, 0], [0, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 1]], "v": [[1, 0, 0, 0, 1], [1, 0, 1, 1, 1], [1, 0, 1, 1, 1], [0, 0, 0, 1, 1]]},
    // A plain L-Ring solution that breaks the corner rule.
    plainOnly: {"h": [[1, 1, 1, 1], [0, 0, 1, 0], [0, 0, 0, 1], [1, 1, 0, 0], [0, 0, 0, 0]], "v": [[1, 0, 0, 0, 1], [1, 0, 1, 1, 1], [1, 0, 1, 0, 0], [0, 0, 0, 0, 0]]},
  },
  {
    name: "puzzle 1",
    cells: [[2, 0, 0, 0, 4, 0], [0, 2, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [2, 0, 1, 0, 0, 0]],
    answer: {"h": [[1, 1, 1, 1, 0], [0, 1, 1, 0, 0], [0, 1, 0, 0, 0], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 0, 1, 0]], "v": [[1, 0, 0, 0, 1, 0], [1, 1, 0, 1, 1, 0], [1, 0, 1, 1, 1, 0], [0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0]]},
    // A plain L-Ring solution that breaks the corner rule.
    plainOnly: {"h": [[1, 1, 1, 1, 0], [0, 1, 1, 0, 0], [0, 1, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 0, 0, 0], [1, 1, 0, 0, 0]], "v": [[1, 0, 0, 0, 1, 0], [1, 1, 0, 1, 1, 0], [1, 0, 1, 1, 1, 0], [0, 1, 1, 0, 0, 0], [1, 0, 1, 0, 0, 0]]},
  },
  {
    name: "puzzle 2",
    cells: [[0, 0, 0, 3, 0, 0], [2, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 4, 0], [0, 0, 0, 0, 0, 0], [0, 2, 0, 4, 0, 0]],
    answer: {"h": [[0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [1, 0, 0, 1, 0], [1, 0, 1, 1, 0], [1, 0, 0, 1, 0], [0, 1, 1, 0, 1]], "v": [[0, 0, 0, 1, 1, 0], [1, 0, 1, 1, 0, 1], [0, 1, 1, 0, 1, 1], [1, 0, 0, 0, 0, 1], [0, 1, 0, 1, 1, 1]]},
    // A plain L-Ring solution that breaks the corner rule.
    plainOnly: {"h": [[0, 0, 1, 0, 0], [1, 1, 0, 0, 0], [1, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 0, 0, 1, 0], [0, 1, 1, 0, 0]], "v": [[0, 0, 1, 1, 0, 0], [1, 0, 0, 1, 0, 0], [0, 1, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0], [0, 1, 0, 1, 0, 0]]},
  },
];

function badCorners(cells: number[][], e: Edges): string[] {
  const bad: string[] = [];
  cells.forEach((row, r) => row.forEach((_, c) => {
    if (cornerState(cells, e, r, c) === "bad") bad.push(`${r},${c}`);
  }));
  return bad;
}

describe("Perfect L-Ring rules", () => {
  for (const b of BOARDS) {
    it(`accepts the solution of ${b.name}`, () => {
      expect(validateLRing(b.cells, b.answer, { perfect: true })).toBe(true);
      expect(badCorners(b.cells, b.answer)).toEqual([]);
      const arrows = b.cells.flat().filter((v) => v > 0).length;
      expect(satisfiedArrows(b.cells, b.answer)).toBe(arrows);
    });

    it(`rejects a plain L-Ring loop on ${b.name}`, () => {
      expect(validateLRing(b.cells, b.plainOnly)).toBe(true);
      expect(validateLRing(b.cells, b.plainOnly, { perfect: true })).toBe(false);
      expect(badCorners(b.cells, b.plainOnly).length).toBeGreaterThan(0);
    });
  }

  it("leaves a corner open until both arms reach a turn", () => {
    const cells = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    // An L at (0,0): right arm of 2 to (0,2), down arm of 1 to (1,0).
    const e: Edges = { h: [[1, 1], [0, 0], [0, 0]], v: [[1, 0, 0], [0, 0, 0]] };
    expect(cornerState(cells, e, 0, 0)).toBe("open");
    // Turn at both ends: (0,2) goes down, (1,0) goes right. Arms 2 and 1 differ by one.
    e.v[0][2] = 1;
    e.h[1][0] = 1;
    expect(cornerState(cells, e, 0, 0)).toBe("bad");
    // Not a turn, or an arrow cell: never judged by the corner rule.
    expect(cornerState(cells, e, 0, 1)).toBe("open");
    expect(cornerState([[2, 0, 0], [0, 0, 0], [0, 0, 0]], e, 0, 0)).toBe("open");
  });

  it("allows equal arms and arms two apart", () => {
    const cells = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    // Square loop round the border: every corner has arms 2 and 2.
    const e: Edges = { h: [[1, 1], [0, 0], [1, 1]], v: [[1, 0, 1], [1, 0, 1]] };
    expect(badCorners(cells, e)).toEqual([]);
  });
});
