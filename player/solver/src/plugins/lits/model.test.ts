import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { LitsModel } from "./model";
import { canonFromRegions, isValidSolution, UNIQUE, MULTIPLE, NONE } from "./fixtures";

const model = (canon = UNIQUE) => LitsModel.fromCanon(canon);

describe("registration gate — classify()", () => {
  it("classifies a forced 6x6 board as 'unique'", () => {
    expect(classify(model(UNIQUE))).toBe("unique");
  });

  it("classifies two free 4x2 halves as 'multiple'", () => {
    expect(classify(model(MULTIPLE))).toBe("multiple");
  });

  it("classifies a lone 2x2 region (only an O fits) as 'none'", () => {
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
  it("yields the forced unique shading, independently rule-valid", () => {
    const grid = solve(model(UNIQUE));
    expect(grid).not.toBeNull();
    expect(isValidSolution(UNIQUE, grid!)).toBe(true);
    // The one shaded pattern for this board (see fixtures UNIQUE).
    expect(grid).toEqual([
      [1, 1, 1, 1, 1, 1],
      [0, 1, 0, 0, 0, 1],
      [0, 1, 1, 1, 0, 1],
      [0, 1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0, 1],
      [0, 1, 0, 0, 0, 1],
    ]);
  });

  it("produces a rule-valid grid for an ambiguous board (any one solution)", () => {
    const grid = solve(model(MULTIPLE));
    expect(grid).not.toBeNull();
    expect(isValidSolution(MULTIPLE, grid!)).toBe(true);
  });

  it("returns null when there is no solution", () => {
    expect(solve(model(NONE))).toBeNull();
  });
});

describe("rule enforcement", () => {
  // A single 4x1 region: the only tetromino that fits is an I. With one region there is
  // no connectivity/adjacency interaction, so it must be uniquely solvable.
  it("a lone 1x4 region forces the single I", () => {
    const canon = canonFromRegions(["AAAA"]);
    expect(classify(LitsModel.fromCanon(canon))).toBe("unique");
    expect(solve(LitsModel.fromCanon(canon))).toEqual([[1, 1, 1, 1]]);
  });

  // Two 1x4 I-regions stacked with no gap would be two adjacent I pieces (rule 4) AND
  // would form shaded 2x2s (rule 3): unsatisfiable.
  it("two stacked 1x4 regions are unsatisfiable (adjacent I + 2x2)", () => {
    const canon = canonFromRegions(["AAAA", "BBBB"]);
    expect(classify(LitsModel.fromCanon(canon))).toBe("none");
  });
});

describe("serialized solution shape", () => {
  it("mirrors the LITS answer { shaded }", async () => {
    const { litsPlugin } = await import("./index");
    const grid = solve(model(UNIQUE))!;
    expect(litsPlugin.serializeSolution!(grid)).toEqual({ shaded: grid });
  });
});

describe("gate() end-to-end", () => {
  it("returns the serialized shaded grid for a unique LITS puzzle", async () => {
    const { gate } = await import("../../gate");
    const result = gate(15, UNIQUE);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("unique");
    expect(result!.solution).toEqual({ shaded: solve(model(UNIQUE)) });
  });

  it("reports 'multiple' with no solution payload", async () => {
    const { gate } = await import("../../gate");
    const result = gate(15, MULTIPLE);
    expect(result).toEqual({ verdict: "multiple", solution: null });
  });
});
