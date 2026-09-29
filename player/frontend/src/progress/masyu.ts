import { PuzzleDefinition } from "../types/puzzle";
import { MasyuCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import {
  Direction,
  getCellConnections,
  isStraight,
  isTurn,
} from "../liveValidators/masyu";

function step(r: number, c: number, d: Direction): [number, number] {
  switch (d) {
    case "up":
      return [r - 1, c];
    case "down":
      return [r + 1, c];
    case "left":
      return [r, c - 1];
    case "right":
      return [r, c + 1];
  }
}

// Reconstruct the h/v edge grids from the flat serialized answer
// (keys "h:r,c" / "v:r,c" → 1), matching the masyu extractor/validator.
function edgesFromValues(
  canon: MasyuCanon,
  userValues: Record<string, number>
): { h: number[][]; v: number[][] } {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const h = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  const v = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  for (const [key, val] of Object.entries(userValues)) {
    if (val !== 1) continue;
    if (key.startsWith("h:")) {
      const [r, c] = key.slice(2).split(",").map(Number);
      if (r < rows && c < cols - 1) h[r][c] = 1;
    } else if (key.startsWith("v:")) {
      const [r, c] = key.slice(2).split(",").map(Number);
      if (r < rows - 1 && c < cols) v[r][c] = 1;
    }
  }
  return { h, v };
}

// True when the circle at (r,c) has its masyu constraint fully satisfied by the
// segments drawn so far — the same per-circle rule applied at completion:
//   - exactly two connected segments, and
//   - white (1): passes straight through with a turn in ≥1 along-line neighbor;
//   - black (2): turns here, with both outgoing segments continuing straight ≥1 cell.
function circleSatisfied(
  r: number,
  c: number,
  kind: number,
  hEdges: number[][],
  vEdges: number[][],
  rows: number,
  cols: number
): boolean {
  const conn = (rr: number, cc: number) =>
    getCellConnections(rr, cc, hEdges, vEdges, rows, cols);
  const dirs = conn(r, c);
  if (dirs.length !== 2) return false;

  if (kind === 1) {
    if (!isStraight(dirs)) return false;
    return dirs.includes("left") && dirs.includes("right")
      ? isTurn(conn(r, c - 1)) || isTurn(conn(r, c + 1))
      : isTurn(conn(r - 1, c)) || isTurn(conn(r + 1, c));
  }
  if (kind === 2) {
    if (!isTurn(dirs)) return false;
    return dirs.every((d) => {
      const [nr, nc] = step(r, c, d);
      return isStraight(conn(nr, nc));
    });
  }
  return false;
}

// Progress = (circles whose constraint is fully satisfied / total circles) * 100.
// Uses the same per-circle predicate as completion, so a solved board reads
// exactly 100% and a board with no circles reads 0.
export const computeMasyuProgress: ProgressCalculator = {
  puzzleType: 7,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canon = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as MasyuCanon;

    const cells = canon.cells;
    const rows = cells.length;
    const cols = rows > 0 ? cells[0].length : 0;
    if (rows === 0 || cols === 0) return 0;

    const { h, v } = edgesFromValues(canon, userValues);

    let total = 0;
    let satisfied = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = cells[r][c];
        if (kind === 0) continue;
        total++;
        if (circleSatisfied(r, c, kind, h, v, rows, cols)) satisfied++;
      }
    }
    if (total === 0) return 0;
    return (satisfied / total) * 100;
  },
};
