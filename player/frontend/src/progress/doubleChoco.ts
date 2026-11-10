import { PuzzleDefinition } from "../types/puzzle";
import { DoubleChocoCanon } from "../types/canon";
import { ProgressCalculator } from "./index";
import { computeRooms, validRoomIds } from "../components/doubleChocoRules";

/**
 * Progress = (cells in rooms that pass every per-room rule / total cells) * 100.
 * A room counts only when its white and gray halves are equal in size, each
 * connected, the same shape, and match any clue in it — so the undivided board
 * at the start doesn't count as a finished room.
 */
export const computeDoubleChocoProgress: ProgressCalculator = {
  puzzleType: 4,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as DoubleChocoCanon;

    const rows = canonRepr.cells.length;
    const cols = rows > 0 ? canonRepr.cells[0].length : 0;
    const totalCells = rows * cols;
    if (totalCells === 0) return 0;

    const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows - 1 && c < cols) h[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols - 1) v[r][c] = val;
      }
    }

    const roomIds = computeRooms(rows, cols, h, v);
    const valid = validRoomIds(canonRepr.cells, roomIds);
    let counted = 0;
    for (const row of roomIds) for (const id of row) if (valid.has(id)) counted++;
    return (counted / totalCells) * 100;
  },
};
