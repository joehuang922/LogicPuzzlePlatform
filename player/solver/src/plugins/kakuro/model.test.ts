import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { KakuroModel } from "./model";
import {
  parseKakuro,
  isValidSolution,
  UNIQUE_2x2,
  MULTIPLE_RUN,
  CONTRADICTORY,
  UNIQUE_MEDIUM,
} from "./fixtures";

const model = (spec: string) => KakuroModel.fromCanon(parseKakuro(spec));

describe("registration gate — classify()", () => {
  it("classifies a crossing 2x2 block as 'unique'", () => {
    expect(classify(model(UNIQUE_2x2))).toBe("unique");
  });

  it("classifies a single ambiguous run as 'multiple'", () => {
    expect(classify(model(MULTIPLE_RUN))).toBe("multiple");
  });

  it("classifies an impossible run (sum 1 over two cells) as 'none'", () => {
    expect(classify(model(CONTRADICTORY))).toBe("none");
  });

  it("solves a larger satisfiable puzzle (unique or multiple, never none)", () => {
    expect(classify(KakuroModel.fromCanon(UNIQUE_MEDIUM))).not.toBe("none");
  });
});

describe("uniqueness proof — countSolutions()", () => {
  it("returns exactly 1 for a unique puzzle", () => {
    expect(countSolutions(model(UNIQUE_2x2), 2)).toBe(1);
  });

  it("returns >= 2 for an ambiguous puzzle", () => {
    expect(countSolutions(model(MULTIPLE_RUN), 2)).toBe(2);
  });

  it("returns 0 for an unsatisfiable puzzle", () => {
    expect(countSolutions(model(CONTRADICTORY), 2)).toBe(0);
  });
});

describe("solution extraction — solve()", () => {
  it("yields the forced 2x2 solution", () => {
    const canon = parseKakuro(UNIQUE_2x2);
    const grid = solve(KakuroModel.fromCanon(canon));
    expect(grid).not.toBeNull();
    // Clue cells are 0; the interior is the forced A=1,B=2,C=3,D=4.
    expect(grid).toEqual([
      [0, 0, 0],
      [0, 1, 2],
      [0, 3, 4],
    ]);
    expect(isValidSolution(canon, grid!)).toBe(true);
  });

  it("produces a rule-valid grid for the medium puzzle", () => {
    const grid = solve(KakuroModel.fromCanon(UNIQUE_MEDIUM));
    expect(grid).not.toBeNull();
    expect(isValidSolution(UNIQUE_MEDIUM, grid!)).toBe(true);
  });

  it("returns null when there is no solution", () => {
    expect(solve(model(CONTRADICTORY))).toBeNull();
  });
});

describe("serialized solution shape", () => {
  it("mirrors KakuroAnswer { values }", async () => {
    const { kakuroPlugin } = await import("./index");
    const grid = solve(model(UNIQUE_2x2))!;
    expect(kakuroPlugin.serializeSolution!(grid)).toEqual({
      values: [
        [0, 0, 0],
        [0, 1, 2],
        [0, 3, 4],
      ],
    });
  });
});
