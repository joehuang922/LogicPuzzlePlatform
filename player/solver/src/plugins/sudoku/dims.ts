/**
 * Board size of a sudoku canon. A room is `room_width` columns by `room_height` rows
 * (both default 3), and the board is N x N with N = room_width * room_height: 9x9 for
 * 3x3 rooms, 16x16 for 4x4, 30x30 for 6-wide, 5-tall rooms. Digits run 1..N.
 */
export interface SudokuDims {
  roomWidth: number;
  roomHeight: number;
  /** N: rows, columns, room cell count and the largest digit. */
  size: number;
}

/** Largest supported N: candidate sets are bit masks over bits 1..N of a 32-bit int. */
export const MAX_SUDOKU_SIZE = 30;

export function sudokuDims(canon: { room_width?: number; room_height?: number }): SudokuDims {
  const roomWidth = canon.room_width ?? 3;
  const roomHeight = canon.room_height ?? 3;
  return { roomWidth, roomHeight, size: roomWidth * roomHeight };
}
