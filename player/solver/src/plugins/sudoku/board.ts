import { CellValues } from "../../types";
import { SudokuCanon } from "./model";
import { SudokuDims, sudokuDims } from "./dims";
import { Geometry, UnitBoard, geometry } from "./units";

/**
 * Row/col/box units for an N x N board with `roomWidth` x `roomHeight` boxes: N rows,
 * then N columns, then N boxes in reading order (cell id = row * N + col).
 */
export function sudokuUnits({ roomWidth, roomHeight, size: n }: SudokuDims): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let br = 0; br < n; br += roomHeight)
    for (let bc = 0; bc < n; bc += roomWidth) {
      const box: number[] = [];
      for (let dr = 0; dr < roomHeight; dr++)
        for (let dc = 0; dc < roomWidth; dc++) box.push((br + dr) * n + (bc + dc));
      units.push(box);
    }
  return units;
}

/** Human-readable cell label on an N-wide board (default 9), e.g. id 30 -> "R4C4". */
export function cellLabel(id: number, size = 9): string {
  return `R${Math.floor(id / size) + 1}C${(id % size) + 1}`;
}

const geometries = new Map<string, Geometry>();

/** The (cached) hint geometry of a board with the given room size. */
export function sudokuGeometry(dims: SudokuDims): Geometry {
  const cacheKey = `${dims.roomWidth}x${dims.roomHeight}`;
  const cached = geometries.get(cacheKey);
  if (cached) return cached;
  const n = dims.size;
  const units = sudokuUnits(dims);
  const unitLabel = (u: number) =>
    u < n ? `row ${u + 1}` : u < 2 * n ? `column ${u - n + 1}` : `box ${u - 2 * n + 1}`;
  const geo = geometry(
    n * n,
    units,
    units.map((_, u) => (u < n ? "row" : u < 2 * n ? "col" : "box")),
    (id) => `${id % n},${Math.floor(id / n)}`,
    (id) => cellLabel(id, n),
    unitLabel
  );
  geometries.set(cacheKey, geo);
  return geo;
}

/** The standard 9x9 geometry. */
export const SUDOKU_GEOMETRY: Geometry = sudokuGeometry(sudokuDims({}));

/** Unit label for an explanation on a 9x9 board, given the unit's index (0..26). */
export function unitLabel(unitIndex: number): string {
  return SUDOKU_GEOMETRY.unitLabel(unitIndex);
}

/** A sudoku's candidate board: the shared hint board over the canon's geometry. */
export type SudokuBoard = UnitBoard;

export const SudokuBoard = {
  /** Givens win; otherwise the player's entry keyed "col,row". Pencil marks are ignored. */
  build(canon: SudokuCanon, entered: CellValues): UnitBoard {
    const geo = sudokuGeometry(sudokuDims(canon));
    const n = geo.digits;
    const values = Array.from({ length: geo.size }, (_, id) => {
      const r = Math.floor(id / n);
      const c = id % n;
      const hint = canon.hints[r]?.[c] ?? 0;
      return hint !== 0 ? hint : entered[`${c},${r}`] ?? 0;
    });
    return UnitBoard.build(geo, values);
  },
};
