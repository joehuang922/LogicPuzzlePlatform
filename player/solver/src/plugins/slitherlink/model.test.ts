import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { SlitherlinkModel } from "./model";
import {
  canonFromClues,
  isValidSolution,
  UNIQUE,
  UNIQUE_SOLUTION,
  MULTIPLE,
  NONE,
} from "./fixtures";

const model = (canon = UNIQUE) => SlitherlinkModel.fromCanon(canon);

describe("registration gate — classify()", () => {
  it("classifies the clued 2x2 (perimeter forced) as 'unique'", () => {
    expect(classify(model(UNIQUE))).toBe("unique");
  });

  it("classifies the unclued 2x2 as 'multiple'", () => {
    expect(classify(model(MULTIPLE))).toBe("multiple");
  });

  it("classifies a lone cell clued 3 as 'none'", () => {
    expect(classify(model(NONE))).toBe("none");
  });
});

describe("uniqueness proof — countSolutions()", () => {
  it("returns exactly 1 for the unique puzzle", () => {
    expect(countSolutions(model(UNIQUE), 2)).toBe(1);
  });

  it("returns >= 2 for the ambiguous puzzle", () => {
    expect(countSolutions(model(MULTIPLE), 2)).toBe(2);
  });

  it("returns 0 for the unsatisfiable puzzle", () => {
    expect(countSolutions(model(NONE), 2)).toBe(0);
  });
});

describe("solution extraction — solve()", () => {
  it("yields the forced perimeter loop, independently rule-valid", () => {
    const edges = solve(model(UNIQUE));
    expect(edges).not.toBeNull();
    expect(isValidSolution(UNIQUE, edges!)).toBe(true);
    expect(edges).toEqual(UNIQUE_SOLUTION);
  });

  it("produces a rule-valid loop for an ambiguous board (any one solution)", () => {
    const edges = solve(model(MULTIPLE));
    expect(edges).not.toBeNull();
    expect(isValidSolution(MULTIPLE, edges!)).toBe(true);
  });

  it("returns null when there is no solution", () => {
    expect(solve(model(NONE))).toBeNull();
  });
});

describe("rule enforcement", () => {
  // A 0-clue forbids all four of its edges; combined with the single-loop requirement a
  // 1x2 board clued "3 0" has no loop at all (the 0 cell kills its edges, stranding the 3).
  it("a 0 clue strips its edges, making an adjacent 3 unsatisfiable", () => {
    expect(classify(SlitherlinkModel.fromCanon(canonFromClues(["30"])))).toBe("none");
  });

  // A 3x3 ring of 0s around a center with no clue: all outer-cell edges are forced off by
  // the zeros, leaving no room for any loop. Unsatisfiable.
  it("a frame of 0s leaves no loop", () => {
    const canon = canonFromClues(["000", "0.0", "000"]);
    expect(classify(SlitherlinkModel.fromCanon(canon))).toBe("none");
  });

  // Single cell clued 4: the only loop is the square around it. Uniquely solvable.
  it("a lone cell clued 4 forces the unit square", () => {
    const canon = canonFromClues(["4"]);
    expect(classify(SlitherlinkModel.fromCanon(canon))).toBe("unique");
    const edges = solve(SlitherlinkModel.fromCanon(canon));
    expect(edges).toEqual({ h: [[1], [1]], v: [[1, 1]] });
    expect(isValidSolution(canon, edges!)).toBe(true);
  });

  // Rejecting a two-loop board: solving must never return a set of disjoint loops, since
  // isSolved verifies single-loop connectivity. On a 2x3 board clued so each 2x2 wants its
  // own ring, the only valid answer the solver can return is still one connected loop.
  it("solve never returns disjoint loops (connectivity enforced at the leaf)", () => {
    const canon = canonFromClues(["22", "22"]);
    const edges = solve(SlitherlinkModel.fromCanon(canon))!;
    // isValidSolution independently rejects multi-loop boards, so passing it proves one loop.
    expect(isValidSolution(canon, edges)).toBe(true);
  });
});

describe("serialized solution shape", () => {
  it("mirrors the SlitherlinkAnswer { edges: { h, v } }", async () => {
    const { slitherlinkPlugin } = await import("./index");
    const edges = solve(model(UNIQUE))!;
    expect(slitherlinkPlugin.serializeSolution!(edges)).toEqual({ edges });
  });
});

describe("gate() end-to-end", () => {
  it("returns the serialized edge grids for a unique Slitherlink puzzle", async () => {
    const { gate } = await import("../../gate");
    const result = gate(5, UNIQUE);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("unique");
    expect(result!.solution).toEqual({ edges: UNIQUE_SOLUTION });
  });

  it("reports 'multiple' with no solution payload", async () => {
    const { gate } = await import("../../gate");
    expect(gate(5, MULTIPLE)).toEqual({ verdict: "multiple", solution: null });
  });

  it("reports 'none' with no solution payload", async () => {
    const { gate } = await import("../../gate");
    expect(gate(5, NONE)).toEqual({ verdict: "none", solution: null });
  });
});
