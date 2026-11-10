/**
 * Sudoku at any size: a room is `room_width` columns by `room_height` rows (both
 * default 3), and the board is N x N with N = room_width * room_height (9x9, 16x16,
 * 25x25, 30x30 with 6-wide, 5-tall rooms, ...). Digits run 1..N and show as numbers.
 * Cell keys are "col,row".
 */

export interface SudokuSize {
  roomWidth: number;
  roomHeight: number;
  /** N: rows, columns, cells per room and the largest digit. */
  size: number;
}

export function sudokuSize(canon: { room_width?: number; room_height?: number }): SudokuSize {
  const roomWidth = canon.room_width ?? 3;
  const roomHeight = canon.room_height ?? 3;
  return { roomWidth, roomHeight, size: roomWidth * roomHeight };
}

/** Sizes the editor offers; any room_width x room_height up to 30 cells is valid. */
export const SUDOKU_SIZES: { label: string; roomWidth: number; roomHeight: number }[] = [
  { label: "9x9 (3x3 rooms)", roomWidth: 3, roomHeight: 3 },
  { label: "16x16 (4x4 rooms)", roomWidth: 4, roomHeight: 4 },
  { label: "25x25 (5x5 rooms)", roomWidth: 5, roomHeight: 5 },
  { label: "30x30 (6 wide, 5 tall rooms)", roomWidth: 6, roomHeight: 5 },
];

/** Per cell key, every other cell sharing its row, column or room. */
export function peerMap({ roomWidth, roomHeight, size: n }: SudokuSize): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const peers = new Set<string>();
      for (let k = 0; k < n; k++) {
        if (k !== col) peers.add(`${k},${row}`);
        if (k !== row) peers.add(`${col},${k}`);
      }
      const r0 = Math.floor(row / roomHeight) * roomHeight;
      const c0 = Math.floor(col / roomWidth) * roomWidth;
      for (let r = r0; r < r0 + roomHeight; r++) {
        for (let c = c0; c < c0 + roomWidth; c++) {
          if (r !== row || c !== col) peers.add(`${c},${r}`);
        }
      }
      map.set(`${col},${row}`, peers);
    }
  }
  return map;
}

/** Keys of cells whose digit repeats in a row, column or room. */
export function conflictCells(dims: SudokuSize, grid: number[][]): Set<string> {
  const { roomWidth, roomHeight, size: n } = dims;
  const conflicts = new Set<string>();
  const check = (cells: [number, number][]) => {
    const seen = new Map<number, string[]>();
    for (const [r, c] of cells) {
      const v = grid[r]?.[c] ?? 0;
      if (v === 0) continue;
      const keys = seen.get(v) ?? [];
      keys.push(`${c},${r}`);
      seen.set(v, keys);
    }
    for (const keys of seen.values()) if (keys.length > 1) keys.forEach((k) => conflicts.add(k));
  };
  for (let i = 0; i < n; i++) {
    check(Array.from({ length: n }, (_, k) => [i, k] as [number, number]));
    check(Array.from({ length: n }, (_, k) => [k, i] as [number, number]));
  }
  for (let r0 = 0; r0 < n; r0 += roomHeight) {
    for (let c0 = 0; c0 < n; c0 += roomWidth) {
      const cells: [number, number][] = [];
      for (let r = r0; r < r0 + roomHeight; r++) for (let c = c0; c < c0 + roomWidth; c++) cells.push([r, c]);
      check(cells);
    }
  }
  return conflicts;
}

/**
 * Typing a number up to `max` one key at a time. A digit that can't start a longer
 * number (on a 16x16, 2-9; or any digit on a 9x9) is final at once; one that can
 * (1 on a 16x16) waits for a second key or the timeout. Returns the number to commit
 * now, if any, and the digits still pending.
 */
export function typeDigit(pending: string, key: string, max: number): { commit: number | null; pending: string } {
  const text = pending + key;
  const value = Number(text);
  if (value < 1 || value > max) {
    // "0" alone is nothing; a second key that overshoots ("1" then "7" on a 16x16)
    // ends the number typed so far.
    return { commit: pending === "" ? null : Number(pending), pending: "" };
  }
  if (value * 10 > max) return { commit: value, pending: "" };
  return { commit: null, pending: text };
}

/** How long a digit that could start a longer number waits for the next key. */
export const DIGIT_WAIT_MS = 800;
