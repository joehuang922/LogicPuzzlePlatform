import { PuzzleDefinition } from "../types/puzzle";
import { KakuroCanon, KakuroCell } from "../types/canon";
import { LiveValidator, LiveValidationResult } from "./index";

// A run is a maximal horizontal or vertical strip of empty cells that a single
// clue's sum constrains. `clueRow/clueCol` locate the clue cell that owns it, so
// a violated run can flag the hint number itself.
export interface Run {
  row: number; // first empty cell of the run
  col: number;
  length: number;
  sum: number;
  direction: "h" | "v";
  clueRow: number;
  clueCol: number;
}

export function getRuns(cells: KakuroCell[][]): Run[] {
  const rows = cells.length;
  const cols = cells[0].length;
  const runs: Run[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.type !== "clue") continue;
      if (cell.right != null) {
        let len = 0;
        for (let cc = c + 1; cc < cols && cells[r][cc].type === "empty"; cc++) len++;
        if (len > 0) {
          runs.push({ row: r, col: c + 1, length: len, sum: cell.right, direction: "h", clueRow: r, clueCol: c });
        }
      }
      if (cell.down != null) {
        let len = 0;
        for (let rr = r + 1; rr < rows && cells[rr][c].type === "empty"; rr++) len++;
        if (len > 0) {
          runs.push({ row: r + 1, col: c, length: len, sum: cell.down, direction: "v", clueRow: r, clueCol: c });
        }
      }
    }
  }
  return runs;
}

// Result of analyzing a partial kakuro answer.
//   cellErrors — empty cells "c,r" whose value participates in a violation.
//   clueErrors — clue hints "c,r:right" / "c,r:down" whose sum is violated.
export interface KakuroAnalysis {
  cellErrors: Set<string>;
  clueErrors: Set<string>;
}

// Report only *certain* violations, so a partially-filled run isn't accused
// unless it already can't be right:
//   - duplicate digit within a run (kakuro forbids repeats)
//   - a fully-filled run whose sum ≠ the hint
//   - a partially-filled run whose running total already exceeds the hint
export function analyzeKakuro(
  canon: KakuroCanon,
  values: Record<string, number>
): KakuroAnalysis {
  const cellErrors = new Set<string>();
  const clueErrors = new Set<string>();
  const runs = getRuns(canon.cells);

  for (const run of runs) {
    const filled: { val: number; key: string }[] = [];
    for (let i = 0; i < run.length; i++) {
      const r = run.direction === "h" ? run.row : run.row + i;
      const c = run.direction === "h" ? run.col + i : run.col;
      const key = `${c},${r}`;
      const val = values[key];
      if (val != null) filled.push({ val, key });
    }

    const clueKey = `${run.clueCol},${run.clueRow}:${run.direction === "h" ? "right" : "down"}`;

    // Duplicate digits within the run.
    const seen = new Map<number, string[]>();
    for (const d of filled) {
      const arr = seen.get(d.val) ?? [];
      arr.push(d.key);
      seen.set(d.val, arr);
    }
    for (const [, keys] of seen) {
      if (keys.length > 1) keys.forEach((k) => cellErrors.add(k));
    }

    const total = filled.reduce((a, b) => a + b.val, 0);

    if (filled.length === run.length) {
      // Fully filled: sum must match exactly.
      if (total !== run.sum) {
        filled.forEach((d) => cellErrors.add(d.key));
        clueErrors.add(clueKey);
      }
    } else if (total > run.sum) {
      // Partially filled but already over the target — unrecoverable.
      filled.forEach((d) => cellErrors.add(d.key));
      clueErrors.add(clueKey);
    }
  }

  return { cellErrors, clueErrors };
}

export const kakuroLiveValidator: LiveValidator = {
  puzzleType: 12,

  validate(
    puzzle: PuzzleDefinition,
    userValues: Record<string, number>
  ): LiveValidationResult {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as KakuroCanon;

    const { cellErrors, clueErrors } = analyzeKakuro(canon, userValues);
    const errors = new Set<string>();
    for (const k of cellErrors) errors.add(`cell:${k}`);
    for (const k of clueErrors) errors.add(`clue:${k}`);
    return { errors };
  },
};
