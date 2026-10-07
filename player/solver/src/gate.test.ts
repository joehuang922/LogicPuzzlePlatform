import { describe, it, expect } from "vitest";
import { gate } from "./gate";
import { parseGrid, isValidSolution, INKALA_HARDEST, SEVENTEEN_CLUE, CONTRADICTORY } from "./plugins/sudoku/fixtures";

describe("registration gate — gate()", () => {
  it("returns null for an unsupported puzzle type (bypass)", () => {
    expect(gate(999, { hints: [] })).toBeNull();
  });

  it("accepts a unique puzzle and returns its solution in canon shape", () => {
    const result = gate(1, parseGrid(INKALA_HARDEST));
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("unique");
    const sol = result!.solution as { hints: number[][] };
    expect(sol.hints).toBeDefined();
    expect(isValidSolution(sol.hints)).toBe(true);
  });

  it("rejects a multi-solution puzzle with no stored solution", () => {
    const stripped = SEVENTEEN_CLUE.replace("1", "0"); // 16 clues -> never unique
    const result = gate(1, parseGrid(stripped));
    expect(result!.verdict).toBe("multiple");
    expect(result!.solution).toBeNull();
  });

  it("rejects an unsatisfiable puzzle with no stored solution", () => {
    const result = gate(1, parseGrid(CONTRADICTORY));
    expect(result!.verdict).toBe("none");
    expect(result!.solution).toBeNull();
  });

  it("returns 'unknown' (no solution) when the search budget is too small to finish", () => {
    // A near-empty grid can't be classified in a handful of nodes; the budget trips and the
    // gate reports an honest "unknown" instead of hanging — never a bogus 'unique'.
    const result = gate(1, parseGrid("0".repeat(81)), { maxNodes: 5 });
    expect(result!.verdict).toBe("unknown");
    expect(result!.solution).toBeNull();
  });

  it("a generous explicit budget classifies a unique puzzle normally", () => {
    const result = gate(1, parseGrid(INKALA_HARDEST), { maxNodes: 1_000_000 });
    expect(result!.verdict).toBe("unique");
    expect(result!.solution).not.toBeNull();
  });
});
