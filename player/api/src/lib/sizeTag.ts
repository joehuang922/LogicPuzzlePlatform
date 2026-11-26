/** BIG / GIANT size pills, server side (mission assignment). Mirrors
 *  frontend/src/utils/puzzleBrowse.ts and Android's SizeTag.kt: change all three. */

export type SizeTag = "BIG" | "GIANT";

export const SUDOKU = 1;
export const COMBO_SUDOKU = 2;
export const NONOGRAM = 6;
export const KAKURO = 12;
export const PICTURESQUE_MAZE = 44;

export interface SizedRow {
  puzzleType: number;
  width: number | null;
  height: number | null;
  /** JSON_LENGTH(canon_repr, '$.subboards') */
  subboards: number | null;
  /** JSON_LENGTH(canon_repr, '$.hints') */
  hintRows: number | null;
}

function tagFor(value: number, big: number, giant: number): SizeTag | null {
  if (value >= giant) return "GIANT";
  if (value >= big) return "BIG";
  return null;
}

export function sizeTag(p: SizedRow): SizeTag | null {
  const cells = (p.width ?? 0) * (p.height ?? 0);
  switch (p.puzzleType) {
    case SUDOKU:
      return tagFor(Math.max(p.width ?? 0, p.height ?? 0) || (p.hintRows ?? 0), 16, 25);
    case COMBO_SUDOKU:
      return tagFor(p.subboards ?? 0, 10, 20);
    case KAKURO:
      return tagFor(cells, 500, 1000);
    case NONOGRAM:
      return tagFor(cells, 3000, 5000);
    case PICTURESQUE_MAZE:
      return tagFor(cells, 9600, 28800);
    default:
      return tagFor(cells, 1000, 2000);
  }
}
