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
  // Ripple Effect: the edge grids must fit the cell grid, and every border must separate
  // two rooms. Editors may hold a wall that stops halfway through a room; this keeps one
  // from ever being stored.
  25: (data: { cells: number[][]; edges: { h: number[][]; v: number[][] } }) => {
    const { cells, edges } = data;
    const rows = cells.length;
    const cols = cells[0].length;
    const fits = (grid: number[][], height: number, width: number) =>
      grid.length === height && grid.every((line) => line.length === width);
    if (!fits(cells, rows, cols)) throw new Error("Invalid ripple effect: cells rows differ in length");
    if (!fits(edges.h, rows - 1, cols) || !fits(edges.v, rows, cols - 1)) {
      throw new Error(`Invalid ripple effect: edges don't match the ${cols}x${rows} grid`);
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
            [cr - 1, cc, cr > 0 && edges.h[cr - 1][cc] === 0],
            [cr + 1, cc, cr < rows - 1 && edges.h[cr][cc] === 0],
            [cr, cc - 1, cc > 0 && edges.v[cr][cc - 1] === 0],
            [cr, cc + 1, cc < cols - 1 && edges.v[cr][cc] === 0],
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
          (r < rows - 1 && edges.h[r][c] === 1 && room[r][c] === room[r + 1][c]) ||
          (c < cols - 1 && edges.v[r][c] === 1 && room[r][c] === room[r][c + 1]);
        if (inside) {
          throw new Error(`Invalid ripple effect: a wall at R${r + 1}C${c + 1} doesn't close off a room`);
        }
      }
    }
  },
};
