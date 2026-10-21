import { describe, it, expect } from "vitest";
import { classify, countSolutions, solve } from "../../drivers";
import { COMBOS, KakuroModel } from "./model";
import {
  parseKakuro,
  isValidSolution,
  UNIQUE_2x2,
  MULTIPLE_RUN,
  CONTRADICTORY,
  UNIQUE_MEDIUM,
  NIKOLI_194_05,
  fromSolution,
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

describe("addition table — COMBOS", () => {
  const digits = (mask: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => mask & (1 << v));

  it("has exactly one combo for each single-formula sum", () => {
    // The two lowest and two highest sums for each length have only one digit set.
    for (let n = 1; n <= 8; n++) {
      const min = (n * (n + 1)) / 2;
      const max = 45 - ((9 - n) * (10 - n)) / 2;
      for (const sum of [min, min + 1, max - 1, max]) expect(COMBOS[n][sum]).toHaveLength(1);
    }
    expect(COMBOS[9][45]).toHaveLength(1);
  });

  it("lists the familiar formulas", () => {
    expect(COMBOS[2][3].map(digits)).toEqual([[1, 2]]);
    expect(COMBOS[2][17].map(digits)).toEqual([[8, 9]]);
    expect(COMBOS[3][7].map(digits)).toEqual([[1, 2, 4]]);
    expect(COMBOS[4][29].map(digits)).toEqual([[5, 7, 8, 9]]);
    expect(COMBOS[6][38].map(digits)).toEqual([[3, 5, 6, 7, 8, 9]]);
    expect(COMBOS[2][10]).toHaveLength(4); // 1+9, 2+8, 3+7, 4+6
  });

  it("covers every set of distinct digits exactly once", () => {
    let total = 0;
    for (const bySum of COMBOS) for (const combos of bySum) total += combos.length;
    expect(total).toBe(511);
  });
});

describe("large boards", () => {
  it("classifies a board of eighteen 45 runs quickly", () => {
    // A filled Sudoku under a clue row and column: every row and column is a 9-cell 45 run.
    // Enumerating orderings cost ~150ms per run per propagation and timed this out; the
    // combo table makes each run a single digit set.
    const rows = [
      "534678912", "672195348", "198342567", "859761423", "426853791",
      "713924856", "961537284", "287419635", "345286179",
    ];
    const grid = [new Array(10).fill(0), ...rows.map((r) => [0, ...r.split("").map(Number)])];
    const start = Date.now();
    expect(classify(KakuroModel.fromCanon(fromSolution(grid)))).toBe("multiple");
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it("proves a real 22x32 board unique and solves it", () => {
    const canon = parseKakuro(NIKOLI_194_05);
    const start = Date.now();
    expect(classify(KakuroModel.fromCanon(canon))).toBe("unique");
    const grid = solve(KakuroModel.fromCanon(canon));
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(isValidSolution(canon, grid!)).toBe(true);
  });
});
