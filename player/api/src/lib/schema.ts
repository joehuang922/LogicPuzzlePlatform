import Ajv, { ValidateFunction } from "ajv";
import sudokuSchema from "../../../../schemas/canon/sudoku.json";
import comboSudokuSchema from "../../../../schemas/canon/combo-sudoku.json";
import nurimazeSchema from "../../../../schemas/canon/nurimaze.json";
import doubleChocoSchema from "../../../../schemas/canon/double-choco.json";
import slitherlinkSchema from "../../../../schemas/canon/slitherlink.json";
import nonogramSchema from "../../../../schemas/canon/nonogram.json";
import masyuSchema from "../../../../schemas/canon/masyu.json";
import pencilsSchema from "../../../../schemas/canon/pencils.json";
import nuritwinSchema from "../../../../schemas/canon/nuritwin.json";
import slalomSchema from "../../../../schemas/canon/slalom.json";
import shakashakaSchema from "../../../../schemas/canon/shakashaka.json";
import kakuroSchema from "../../../../schemas/canon/kakuro.json";
import yajilinSchema from "../../../../schemas/canon/yajilin.json";
import fillominoSchema from "../../../../schemas/canon/fillomino.json";
import litsSchema from "../../../../schemas/canon/lits.json";
import chocoBananaSchema from "../../../../schemas/canon/choco-banana.json";
import numberLinkSchema from "../../../../schemas/canon/number-link.json";
import akariSchema from "../../../../schemas/canon/akari.json";
import hellGolfSchema from "../../../../schemas/canon/hell-golf.json";
import tentaishowSchema from "../../../../schemas/canon/tentaishow.json";
import heyawakeSchema from "../../../../schemas/canon/heyawake.json";
import shikakuSchema from "../../../../schemas/canon/shikaku.json";
import norinoriSchema from "../../../../schemas/canon/norinori.json";
import nurikabeSchema from "../../../../schemas/canon/nurikabe.json";
import rippleEffectSchema from "../../../../schemas/canon/ripple-effect.json";
import hitoriSchema from "../../../../schemas/canon/hitori.json";
import pictoLinkSchema from "../../../../schemas/canon/picto-link.json";
import kuralinSchema from "../../../../schemas/canon/kuralin.json";
import unequalSudokuSchema from "../../../../schemas/canon/unequal-sudoku.json";
import cornerChainSchema from "../../../../schemas/canon/corner-chain.json";
import sinkaminoSchema from "../../../../schemas/canon/sinkamino.json";
import balanceLinkSchema from "../../../../schemas/canon/balance-link.json";
import lRingSchema from "../../../../schemas/canon/l-ring.json";

const ajv = new Ajv();

const validators: Record<number, ValidateFunction> = {
  1: ajv.compile(sudokuSchema),
  2: ajv.compile(comboSudokuSchema),
  3: ajv.compile(nurimazeSchema),
  4: ajv.compile(doubleChocoSchema),
  5: ajv.compile(slitherlinkSchema),
  6: ajv.compile(nonogramSchema),
  7: ajv.compile(masyuSchema),
  8: ajv.compile(pencilsSchema),
  9: ajv.compile(nuritwinSchema),
  10: ajv.compile(slalomSchema),
  11: ajv.compile(shakashakaSchema),
  12: ajv.compile(kakuroSchema),
  13: ajv.compile(yajilinSchema),
  14: ajv.compile(fillominoSchema),
  15: ajv.compile(litsSchema),
  16: ajv.compile(chocoBananaSchema),
  17: ajv.compile(numberLinkSchema),
  18: ajv.compile(akariSchema),
  19: ajv.compile(hellGolfSchema),
  20: ajv.compile(tentaishowSchema),
  21: ajv.compile(heyawakeSchema),
  22: ajv.compile(shikakuSchema),
  23: ajv.compile(norinoriSchema),
  24: ajv.compile(nurikabeSchema),
  25: ajv.compile(rippleEffectSchema),
  26: ajv.compile(hitoriSchema),
  27: ajv.compile(pictoLinkSchema),
  28: ajv.compile(kuralinSchema),
  29: ajv.compile(unequalSudokuSchema),
  30: ajv.compile(cornerChainSchema),
  31: ajv.compile(sinkaminoSchema),
  32: ajv.compile(balanceLinkSchema),
  33: ajv.compile(lRingSchema),
};

export function validateCanon(puzzleType: number, data: unknown): void {
  const validate = validators[puzzleType];
  if (!validate) {
    throw new Error(`No schema registered for puzzle type ${puzzleType}`);
  }
  if (!validate(data)) {
    const errors = ajv.errorsText(validate.errors);
    throw new Error(`Invalid canonRepr for puzzle type ${puzzleType}: ${errors}`);
  }
  semanticChecks[puzzleType]?.(data);
}

// Cheap consistency checks a JSON schema can't express, run after it passes. Unlike the
// solver gate these need no solver: they reject canons that are impossible on their face
// (typically a mis-parse) for types the gate doesn't cover.
const semanticChecks: Record<number, (data: any) => void> = {
  // Nonogram
  6: (data: { rowClues: number[][]; colClues: number[][] }) => {
    const { rowClues, colClues } = data;
    // Each line's blocks plus one gap between neighbours must fit in the line.
    const minLength = (clue: number[]) => {
      const blocks = clue.filter((n) => n > 0);
      return blocks.reduce((a, b) => a + b, 0) + Math.max(0, blocks.length - 1);
    };
    const checkFit = (clues: number[][], label: string, length: number) =>
      clues.forEach((clue, i) => {
        if (minLength(clue) > length) {
          throw new Error(
            `Invalid nonogram: ${label} ${i} clue [${clue.join(",")}] needs ${minLength(clue)} cells but the line has ${length}`
          );
        }
      });
    checkFit(rowClues, "row", colClues.length);
    checkFit(colClues, "column", rowClues.length);

    // Rows and columns count the same filled cells, so their clue sums must match.
    const sum = (clues: number[][]) => clues.flat().reduce((a, b) => a + b, 0);
    const rowSum = sum(rowClues);
    const colSum = sum(colClues);
    if (rowSum !== colSum) {
      throw new Error(
        `Invalid nonogram: row clues sum to ${rowSum} but column clues sum to ${colSum}; they must match`
      );
    }
  },
  // Heyawake: the rooms are the board's format, so they must tile the grid exactly —
  // every cell in exactly one room. Editors may hold interim layouts that don't; this
  // keeps one from ever being stored.
  21: (data: { width: number; height: number; rooms: { r: number; c: number; w: number; h: number }[] }) => {
    const { width, height, rooms } = data;
    const cover = Array.from({ length: height }, () => Array<number>(width).fill(0));
    for (const room of rooms) {
      if (room.r + room.h > height || room.c + room.w > width) {
        throw new Error(
          `Invalid heyawake: room at R${room.r + 1}C${room.c + 1} (${room.w}x${room.h}) runs off the ${width}x${height} grid`
        );
      }
      for (let r = room.r; r < room.r + room.h; r++) {
        for (let c = room.c; c < room.c + room.w; c++) {
          if (cover[r][c]++ > 0) {
            throw new Error(`Invalid heyawake: rooms overlap at R${r + 1}C${c + 1}`);
          }
        }
      }
    }
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (cover[r][c] === 0) throw new Error(`Invalid heyawake: R${r + 1}C${c + 1} is in no room`);
      }
    }
  },
  // Nurimaze: the symbol grid fixes the size; the walls must fit it and every one must
  // separate two rooms.
  3: (data: { cells: number[][]; grids: { h: number[][]; v: number[][] } }) =>
    checkCellsAndRoomWalls("nurimaze", data),
  // Nuritwin: as nurimaze, with room numbers in the cells.
  9: (data: { cells: number[][]; grids: { h: number[][]; v: number[][] } }) =>
    checkCellsAndRoomWalls("nuritwin", data),
  // Tentaishow: every dot must sit inside the grid (a cell center, interior edge midpoint
  // or interior corner), and no two dots may share a spot.
  20: (data: { width: number; height: number; dots: { dr: number; dc: number }[] }) => {
    const { width, height, dots } = data;
    const seen = new Set<string>();
    for (const { dr, dc } of dots) {
      if (dr > 2 * height - 1 || dc > 2 * width - 1) {
        throw new Error(`Invalid tentaishow: dot at (${dr}, ${dc}) is outside the ${width}x${height} grid`);
      }
      const key = `${dr},${dc}`;
      if (seen.has(key)) throw new Error(`Invalid tentaishow: two dots at (${dr}, ${dc})`);
      seen.add(key);
    }
  },
  // Sinkamino: the arrow trails are the board's format. Each must stay on the grid, step
  // between orthogonal neighbours and never cross a black cell. Editors may hold a
  // half-drawn trail; this keeps one from ever being stored.
  31: (data: { cells: number[][]; arrows: number[][][] }) => {
    const { cells, arrows } = data;
    const rows = cells.length;
    const cols = cells[0].length;
    cells.forEach((row, r) => {
      if (row.length !== cols) {
        throw new Error(`Invalid sinkamino: row ${r + 1} has ${row.length} cells, expected ${cols}`);
      }
    });
    arrows.forEach((trail, i) => {
      trail.forEach(([r, c], j) => {
        if (r >= rows || c >= cols) {
          throw new Error(`Invalid sinkamino: arrow ${i + 1} leaves the ${cols}x${rows} grid at R${r + 1}C${c + 1}`);
        }
        if (cells[r][c] === 1) {
          throw new Error(`Invalid sinkamino: arrow ${i + 1} crosses the black cell R${r + 1}C${c + 1}`);
        }
        if (j > 0) {
          const [pr, pc] = trail[j - 1];
          if (Math.abs(pr - r) + Math.abs(pc - c) !== 1) {
            throw new Error(
              `Invalid sinkamino: arrow ${i + 1} jumps from R${pr + 1}C${pc + 1} to R${r + 1}C${c + 1}`
            );
          }
        }
      });
    });
  },
  // LITS: as norinori, the walls are the board's format.
  15: (data: { grids: { h: number[][]; v: number[][] } }) => {
    const { h, v } = data.grids;
    if (v.length === 0) throw new Error("Invalid LITS: no cells");
    checkRoomWalls("LITS", v.length, v[0].length + 1, h, v);
  },
  // Norinori: the walls are the board's format; every one must separate two rooms. Editors
  // may hold a wall that stops halfway through a room; this keeps one from ever being stored.
  23: (data: { grids: { h: number[][]; v: number[][] } }) => {
    const { h, v } = data.grids;
    const rows = v.length;
    if (rows === 0) throw new Error("Invalid norinori: no cells");
    checkRoomWalls("norinori", rows, v[0].length + 1, h, v);
  },
  // Ripple Effect: the edge grids must fit the cell grid, and every border must separate
  // two rooms. Editors may hold a wall that stops halfway through a room; this keeps one
  // from ever being stored.
  25: (data: { cells: number[][]; edges: { h: number[][]; v: number[][] } }) => {
    const { cells, edges } = data;
    const rows = cells.length;
    const cols = cells[0].length;
    if (!cells.every((line) => line.length === cols)) {
      throw new Error("Invalid ripple effect: cells rows differ in length");
    }
    checkRoomWalls("ripple effect", rows, cols, edges.h, edges.v);
  },
  // Kuralin: every circle must sit on an interior grid line (edge midpoint or corner,
  // never a cell center), and no two circles may share a spot.
  28: (data: { width: number; height: number; circles: { dr: number; dc: number }[] }) => {
    const { width, height, circles } = data;
    const seen = new Set<string>();
    for (const { dr, dc } of circles) {
      if (dr > 2 * height - 1 || dc > 2 * width - 1) {
        throw new Error(`Invalid kuralin: circle at (${dr},${dc}) is outside the ${width}x${height} grid`);
      }
      if (dr % 2 === 1 && dc % 2 === 1) {
        throw new Error(`Invalid kuralin: circle at (${dr},${dc}) is at a cell center; circles sit on grid lines`);
      }
      const key = `${dr},${dc}`;
      if (seen.has(key)) throw new Error(`Invalid kuralin: two circles at (${dr},${dc})`);
      seen.add(key);
    }
  },
};

/** A `{ cells, grids: { h, v } }` board: the cells must be a rectangle the walls fit. */
function checkCellsAndRoomWalls(
  name: string,
  data: { cells: number[][]; grids: { h: number[][]; v: number[][] } }
): void {
  const { cells, grids } = data;
  const cols = cells[0].length;
  if (cols === 0 || !cells.every((line) => line.length === cols)) {
    throw new Error(`Invalid ${name}: cells rows must be non-empty and equal in length`);
  }
  checkRoomWalls(name, cells.length, cols, grids.h, grids.v);
}

/**
 * The wall grids of a rooms-by-walls board — h: (rows-1) x cols, the wall under each cell;
 * v: rows x (cols-1), the wall right of it (1 = wall) — must fit the grid, and every wall
 * must separate two rooms (a wall that stops halfway through a room isn't a layout).
 */
function checkRoomWalls(name: string, rows: number, cols: number, h: number[][], v: number[][]): void {
  const fits = (grid: number[][], height: number, width: number) =>
    grid.length === height && grid.every((line) => line.length === width);
  if (!fits(h, rows - 1, cols) || !fits(v, rows, cols - 1)) {
    throw new Error(`Invalid ${name}: walls don't match the ${cols}x${rows} grid`);
  }
  const room = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  let next = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (room[r][c] >= 0) continue;
      room[r][c] = next;
      const stack: [number, number][] = [[r, c]];
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        const open: [number, number, boolean][] = [
          [cr - 1, cc, cr > 0 && h[cr - 1][cc] === 0],
          [cr + 1, cc, cr < rows - 1 && h[cr][cc] === 0],
          [cr, cc - 1, cc > 0 && v[cr][cc - 1] === 0],
          [cr, cc + 1, cc < cols - 1 && v[cr][cc] === 0],
        ];
        for (const [nr, nc, passable] of open) {
          if (passable && room[nr][nc] < 0) {
            room[nr][nc] = next;
            stack.push([nr, nc]);
          }
        }
      }
      next++;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const inside =
        (r < rows - 1 && h[r][c] === 1 && room[r][c] === room[r + 1][c]) ||
        (c < cols - 1 && v[r][c] === 1 && room[r][c] === room[r][c + 1]);
      if (inside) {
        throw new Error(`Invalid ${name}: a wall at R${r + 1}C${c + 1} doesn't close off a room`);
      }
    }
  }
}
