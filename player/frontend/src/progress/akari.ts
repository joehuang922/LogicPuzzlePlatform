import { PuzzleDefinition } from "../types/puzzle";
import { AkariCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeAkariProgress: ProgressCalculator = {
  puzzleType: 18,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as AkariCanon;

    const cells = canonRepr.cells;
    const rows = cells.length;
    const cols = cells[0].length;

    const isBlack = (r: number, c: number) => cells[r][c] !== -1;
    const hasBulb = (r: number, c: number) =>
      !isBlack(r, c) && (userValues[`${c},${r}`] ?? 0) === 1;

    // Mark every white cell illuminated by a bulb (rays stop at walls / edges).
    const lit: boolean[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(false)
    );
    const dirs: [number, number][] = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!hasBulb(r, c)) continue;
        lit[r][c] = true;
        for (const [dr, dc] of dirs) {
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !isBlack(nr, nc)) {
            lit[nr][nc] = true;
            nr += dr;
            nc += dc;
          }
        }
      }
    }

    let whiteCells = 0;
    let litCells = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isBlack(r, c)) continue;
        whiteCells++;
        if (lit[r][c]) litCells++;
      }
    }

    if (whiteCells === 0) return 100;
    return (litCells / whiteCells) * 100;
  },
};
